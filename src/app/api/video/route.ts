import { NextResponse } from "next/server";

import { HTTPError } from "@/lib/errors";
import { makeErrorResponse, makeSuccessResponse } from "@/lib/http";

import { RecipeInfo, RecipeInfoDatoCMS, VideoInfo } from "@/types";
import { getVideoInfo } from "@/features/instagram";
import { INSTAGRAM_CONFIGS } from "@/features/instagram/constants";
import { getPostIdFromUrl } from "@/features/instagram/utils";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { buildClient } from "@datocms/cma-client-node";

function formatDate() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

const example = {
  recipe: {
    name: "Pad Thai",
    ingredients: [
      "250g Dried Rice Noodles",
      "Thai Chilli Powder, To Serve",
      "Lime Wedges, To Serve",
      "2.5 tbsp Tamarind Puree",
      "3.5 tbsp Brown Sugar",
      "3 tbsp Fish Sauce",
      "2 tbsp Oyster Sauce",
      "3 tbsp Neutral Oil",
      "3-4 Garlic Cloves, Finely Chopped",
      "1 Small Onion, Sliced",
      "200g Chicken Thigh, Thinly Sliced",
      "150g Prawn Tails, Peeled, Deveined",
      "3 Spring Onions (Or A Handful Of Garlic Chives), Cut Into 3cm Pieces, White And Green Part Separated",
      "2 Eggs, Lightly Whisked",
      "1.5 Cups Of Beansprouts, Plus Extra",
      "0.5 Cup Firm Tofu, Sliced Into Strips",
      "0.33 Cup Finely Chopped Peanuts, Plus Extra",
    ],
    steps: [
      {
        title: "Noodle Preparation",
        instructions: [
          "Soak 250g of dried rice noodles in boiling water for about 5 minutes, then drain and rinse under cold water to stop from cooking further. Set aside.",
        ],
      },
      {
        title: "Pad Thai Sauce",
        instructions: [
          "Mix 2.5 tbsp of tamarind puree, 3.5 tbsp of brown sugar, 3 tbsp of fish sauce, and 2 tbsp of oyster sauce, and set aside.",
        ],
      },
      {
        title: "Stir Fry",
        instructions: [
          "Heat 3 tbsp of neutral oil in a wok or large pan over high heat.",
          "Add 3-4 finely chopped garlic cloves and 1 small sliced onion, and stir-fry until fragrant, about 30 seconds.",
          "Add 200g of thinly sliced chicken thigh and stir-fry until just cooked, then add 150g of prawn tails and the white parts of 3 spring onions.",
          "Push everything to the side of the wok and pour in 2 lightly whisked eggs. Scramble using a spatula or wooden spoon, then mix everything together.",
        ],
      },
      {
        title: "Combine Ingredients",
        instructions: [
          "Add 1.5 cups of beansprouts, 0.5 cup of sliced firm tofu, the soaked noodles, and the prepared Pad Thai sauce, and gently toss until everything is well coated.",
          "Add the green parts of the spring onion and 0.33 cup of finely chopped peanuts, then gently toss for a further 1-2 minutes.",
        ],
      },
      {
        title: "Serve",
        instructions: [
          "Transfer to a serving plate and top with fresh bean sprouts, Thai chilli powder, extra peanuts, and a squeeze of fresh lime juice to finish.",
        ],
      },
    ],
  },
};

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

    // const object = example;
    // console.log(process.env.DATOCMS_API_TOKEN);
    // const client = buildClient({
    //   apiToken: process.env.DATOCMS_API_TOKEN ?? "",
    // });
    // const record = await client.items.create({
    //   title: { en: object.recipe.name },
    //   ingredients: { en: "abc" },
    //   structured_text_field: {
    //     schema: "dast",
    //     document: {
    //       type: "root",
    //       children: [
    //         {
    //           type: "heading",
    //           level: 1,
    //           children: [{ type: "span", value: "Main Heading" }],
    //         },
    //         {
    //           type: "paragraph",
    //           children: [
    //             { type: "span", value: "This is a paragraph with " },
    //             { type: "span", marks: ["strong"], value: "bold text" },
    //             { type: "span", value: " and " },
    //             { type: "span", marks: ["emphasis"], value: "italic text" },
    //             { type: "span", value: "." },
    //           ],
    //         },
    //         {
    //           type: "list",
    //           style: "bulleted",
    //           children: [
    //             {
    //               type: "listItem",
    //               children: [
    //                 {
    //                   type: "paragraph",
    //                   children: [{ type: "span", value: "List item 1" }],
    //                 },
    //               ],
    //             },
    //             {
    //               type: "listItem",
    //               children: [
    //                 {
    //                   type: "paragraph",
    //                   children: [{ type: "span", value: "List item 2" }],
    //                 },
    //               ],
    //             },
    //           ],
    //         },
    //       ],
    //     },
    //   },
    //   todo: { en: "abc" },
    //   date: formatDate(),
    //   slug: { en: "" },
    //   item_type: {
    //     type: "item_type",
    //     id: "YcJscRUJQKeioYp5KnB8Pg",
    //   },
    // });
    // console.log(record);

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    return handleError(error);
  }
}
