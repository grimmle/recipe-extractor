import { NextResponse } from "next/server";

import { HTTPError } from "@/lib/errors";
import { makeErrorResponse, makeSuccessResponse } from "@/lib/http";

import { RecipeInfo, VideoInfo } from "@/types";
import { getVideoInfo } from "@/features/instagram";
import { INSTAGRAM_CONFIGS } from "@/features/instagram/constants";
import { getPostIdFromUrl } from "@/features/instagram/utils";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

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

export async function POST(request: Request) {
  if (!INSTAGRAM_CONFIGS.enableServerAPI) {
    const notImplementedResponse = makeErrorResponse("Not Implemented");
    return NextResponse.json(notImplementedResponse, { status: 501 });
  }

  const postData = await request.json();
  const postUrl = postData.postUrl;
  if (!postUrl) {
    const badRequestResponse = makeErrorResponse("Post URL is required");
    return NextResponse.json(badRequestResponse, { status: 400 });
  }

  const postId = getPostIdFromUrl(postUrl);
  if (!postId) {
    const noPostIdResponse = makeErrorResponse("Invalid Post URL");
    return NextResponse.json(noPostIdResponse, { status: 400 });
  }

  try {
    const postInfo = await getVideoInfo(postId);
    const recipeText = postInfo.caption;
    if (!recipeText) {
      const badRequestResponse = makeErrorResponse("No caption found.");
      return NextResponse.json(badRequestResponse, { status: 400 });
    }
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          ingredients: z.array(z.string()),
          steps: z.array(
            z.object({
              title: z.string(),
              instructions: z.array(z.string()),
            })
          ),
          url: z.optional(z.string()),
        }),
      }),
      prompt: `You are my personal assistant and help me transribe recipes for my cookbook. 
                What are the ingredients (with measurements) and steps for the following recipe? 
                Always convert all measurements to the metric systems if that is not already the case.
                The steps should be separated into parts of the recipe (e.g. "Cream cheese frosting" or "Sauce") 
                if a part consists of at least two instructions. If a step should always mention the necessary 
                ingredients with measurements to fulfill it, e.g. a step like "Mix all ingredients for the batter" 
                should instead be "Mix 200g of flour, 100ml of milk and 3 eggs". Do not add any info by yourself! 
                Only output ingredients and steps that are stated in the original recipe. Recipe: "${recipeText}"`,
    });
    object.recipe.url = postUrl;
    const response = makeSuccessResponse<RecipeInfo>(object.recipe);
    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    return handleError(error);
  }
}
