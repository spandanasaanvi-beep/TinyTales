export type ChapterPage = {
  id: string;
  chapter_id: string;
  image_url: string;
  page_order: number;
  created_at?: string;
};

export type Chapter = {
  id: string;
  story_id: string;
  title: string;
  chapter_order: number;
  published: boolean;
  created_at?: string;
  pages?: ChapterPage[];
};

export type Story = {
  id: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  published: boolean;
  created_at?: string;
  updated_at?: string;
  chapters?: Chapter[];
};

export type ReadingProgress = {
  id?: string;
  pet_name: string;
  story_id: string;
  chapter_id: string;
  page_index: number;
  updated_at?: string;
};

export type FeedbackEntry = {
  id?: string;
  pet_name: string;
  feedback: string;
  created_at?: string;
};
