export type QueryPage = {
  url: string | null;
  title: string | null;
  content: string | null;
  images: Record<string, string>;
};

export type QueryDataResult = QueryPage[];
