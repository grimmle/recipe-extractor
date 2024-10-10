export type SiteConfig = {
  name: string;
  description: string;
  url: string;
  ogImageUrl: string;
  links: {
    twitter: string;
    github: string;
  };
};

export type Unit = "ms" | "s" | "m" | "h" | "d";
export type Duration = `${number} ${Unit}` | `${number}${Unit}`;

export type RecipeInfo = {
  name: string;
  ingredients?: any;
  steps?: any;
  url?: string;
};

export type RecipeInfoDatoCMS = {
  title: { en: string };
  ingredients: { en: string };
  todo: { en: string };
  inspiredBy?: { en: string };
};

export type VideoInfo = {
  filename: string;
  width: string;
  height: string;
  videoUrl: string;
  caption?: string;
};

export type SuccessResponse<T> = {
  status: "success";
  message?: string;
  data: T;
};

export type ErrorResponse = {
  status: "error";
  message: string;
};

export type APIResponse<T> = SuccessResponse<T> | ErrorResponse;

export type AsyncReturnType<T extends (...args: any) => any> = T extends (
  ...args: any
) => Promise<infer R>
  ? R
  : never;
