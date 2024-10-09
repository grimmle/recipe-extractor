import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { NextResponse } from "next/server";
import { makeErrorResponse, makeSuccessResponse } from "@/lib/http";
import { RecipeInfo } from "@/types";
import { HTTPError } from "@/lib/errors";

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
  const body = await request.json();
  const recipeText = body.recipeText;
  if (!recipeText && !recipeText?.trim()) {
    const badRequestResponse = makeErrorResponse("Recipe Text is required");
    return NextResponse.json(badRequestResponse, { status: 400 });
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4-turbo"),
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
