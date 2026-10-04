create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key default uuid_generate_v4(),
  pet_name text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.stories (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  cover_url text,
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.chapters (
  id uuid primary key default uuid_generate_v4(),
  story_id uuid not null references public.stories(id) on delete cascade,
  title text not null,
  chapter_order integer not null default 1,
  published boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.chapter_pages (
  id uuid primary key default uuid_generate_v4(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  image_url text not null,
  page_order integer not null default 1,
  created_at timestamptz default now()
);

create table if not exists public.reading_progress (
  id uuid primary key default uuid_generate_v4(),
  pet_name text not null,
  story_id uuid not null references public.stories(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  page_index integer not null default 0,
  updated_at timestamptz default now()
);

create table if not exists public.feedback (
  id uuid primary key default uuid_generate_v4(),
  pet_name text not null,
  feedback text not null,
  created_at timestamptz default now()
);

create index if not exists stories_published_idx on public.stories(published);
create index if not exists chapters_story_idx on public.chapters(story_id, chapter_order);
create index if not exists chapter_pages_chapter_idx on public.chapter_pages(chapter_id, page_order);
create index if not exists feedback_created_idx on public.feedback(created_at desc);

create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger stories_update_updated_at
before update on public.stories
for each row
execute procedure public.update_updated_at();

create trigger reading_progress_update_updated_at
before update on public.reading_progress
for each row
execute procedure public.update_updated_at();
