import { NextResponse } from "next/server";

import { HTTPError } from "@/lib/errors";
import { makeErrorResponse, makeSuccessResponse } from "@/lib/http";

import { getVideoInfo } from "@/features/instagram";
import { INSTAGRAM_CONFIGS } from "@/features/instagram/constants";
import { getPostIdFromUrl } from "@/features/instagram/utils";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { buildClient } from "@datocms/cma-client-node";
import { parse5ToStructuredText } from "datocms-html-to-structured-text";
import { parse } from "parse5";
import sendEmailNotification from "@/lib/mailer";

function formatTodaysDate() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();

  return `${year}-${month}-${day}`;
}

function handleError(error: any) {
  if (error instanceof HTTPError) {
    const response = makeErrorResponse(error.message);
    return NextResponse.json(response, { status: error.status });
  } else {
    console.error(error);
    const response = makeErrorResponse();
    return NextResponse.json(response, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!INSTAGRAM_CONFIGS.enableServerAPI) {
    const notImplementedResponse = makeErrorResponse("Not Implemented");
    return NextResponse.json(notImplementedResponse, { status: 501 });
  }

  const urlFromQueryParam = new URL(request.url).searchParams.get("postUrl");
  if (!urlFromQueryParam) {
    const badRequestResponse = makeErrorResponse("Post URL is required");
    return NextResponse.json(badRequestResponse, { status: 400 });
  }

  const postUrl = decodeURIComponent(urlFromQueryParam);
  const postId = getPostIdFromUrl(postUrl);
  if (!postId) {
    const noPostIdResponse = makeErrorResponse("Invalid Post URL");
    return NextResponse.json(noPostIdResponse, { status: 400 });
  }

  try {
    console.log("get video info");
    const postInfo = await getVideoInfo(postId);
    // TODO: do video2text transform to extract valuable data if no caption is provided

    const recipeText = postInfo.caption;
    if (!recipeText) {
      const badRequestResponse = makeErrorResponse("No caption found.");
      return NextResponse.json(badRequestResponse, { status: 400 });
    }
    console.log("generate object with OpenAI");
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          ingredients: z.string(),
          steps: z.string(),
          url: z.optional(z.string()),
        }),
      }),
      prompt: `You are my personal assistant and help me transribe recipes for my cookbook.
                What are the ingredients (with measurements) and steps for the following recipe?
                Always convert all measurements to the metric systems if that is not already the case!
                Translate everything to english.
                
                The steps should be separated into parts of the recipe (e.g. "Cream cheese frosting" or "Sauce")
                if a part consists of at least two instructions. A step should always mention the necessary
                ingredients with measurements to fulfill it, e.g. a step like "Mix all ingredients for the batter"
                should instead be "Mix 200g of flour, 100ml of milk and 3 eggs". Any ingredient in a step should be
                formatted in bold using the <strong> tag. The ingredients and steps should be returned as a single 
                string of valid HTML. Ingredients are listed in an unordered list <ul>, each item added as an <li> element
                and in the following structure: e.g. '200g Potatoes' with the measurement after the ingredient and 
                no space between the number and any metric unit. Headings in the steps are <h4> elements and steps 
                below them are listed in a ordered list <ol>. 

                Do not add any info by yourself! Only output ingredients and steps that are stated in the original recipe. 
                Recipe: "${recipeText}"`,
    });
    object.recipe.url = postUrl;
    const client = buildClient({
      apiToken: process.env.DATOCMS_API_TOKEN ?? null,
    });
    console.log("create object for DatoCMS");
    const record = await client.items.create({
      date: formatTodaysDate(),
      inspired_by: postUrl,
      title: { en: object.recipe.name },
      slug: {
        en: object.recipe.name
          .replace(/[^\w\s]/gi, " ")
          .replace(/\s+/g, "-")
          .toLowerCase(),
      },
      ingredients: {
        en: await parse5ToStructuredText(
          parse(object.recipe.ingredients, {
            sourceCodeLocationInfo: true,
          })
        ),
      },
      todo: {
        en: await parse5ToStructuredText(
          parse(object.recipe.steps, {
            sourceCodeLocationInfo: true,
          })
        ),
      },
      item_type: {
        type: "item_type",
        id: "YcJscRUJQKeioYp5KnB8Pg",
      },
    });

    console.log("send mail");
    sendEmailNotification(object.recipe.name);

    const response = makeSuccessResponse(record);
    return NextResponse.json(response);
  } catch (error: any) {
    return handleError(error);
  }
}
