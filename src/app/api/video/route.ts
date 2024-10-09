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

export async function GET(request: Request) {
  if (!INSTAGRAM_CONFIGS.enableServerAPI) {
    const notImplementedResponse = makeErrorResponse("Not Implemented");
    return NextResponse.json(notImplementedResponse, { status: 501 });
  }

  const postUrl = new URL(request.url).searchParams.get("postUrl");
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
    const postJson = await getVideoInfo(postId);
    const recipeText = postJson.caption;
    if (!recipeText) {
      const badRequestResponse = makeErrorResponse("No caption found.");
      return NextResponse.json(badRequestResponse, { status: 400 });
    }
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          ingredients: z.array(
            z.object({ name: z.string(), amount: z.string() })
          ),
          steps: z.array(z.string()),
        }),
      }),
      prompt: `You are my personal chef. What are the ingredients (with measurements) and steps for the following recipe? Convert all measurements to the metric systems if not already the case. Recipe: "${recipeText}"`,
    });
    console.log(object);
    const response = makeSuccessResponse<RecipeInfo>(object.recipe);
    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    return handleError(error);
  }
}
