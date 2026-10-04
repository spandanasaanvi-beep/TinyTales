# TinyTales

TinyTales is a magical reading app with a public reader experience and a private author board.

## Project overview

- Reader side: choose a pet name, read stories, browse chapters, bookmark progress
- Author side: create stories, upload covers, add chapters, upload pages, publish updates
- Feedback: readers can submit feedback that the author can review
- Storage: image uploads are kept in Supabase Storage when configured

## Files created

- `package.json` – app dependencies and scripts
- `src/App.tsx` – main reader, sidebar, story flow, author dashboard, and page logic
- `src/index.css` – the pink magical storybook theme
- `src/lib/supabase.ts` – Supabase client setup and environment config
- `src/types.ts` – TypeScript data models
- `supabase/schema.sql` – database tables for stories, chapters, pages, feedback, and progress
- `.env.example` – required environment variables
- `README.md` – setup and deployment instructions

## Required services

This app is designed to work best with:

1. Supabase project
   - Database for stories, chapters, feedback, and progress
   - Storage bucket for uploaded images
2. Vite frontend
   - Deployed to a static host such as Vercel, Netlify, or Cloudflare Pages

## Required environment variables

Create a `.env.local` file based on `.env.example` and fill in your real values:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_AUTHOR_KEY=Starlight
```

Important:

- The author key is not shown in the public UI.
- Keep the key in your environment, not in visible text or comments.
- The app will still run in browser local storage mode without Supabase, but live persistence needs the values above.

## Database + storage setup in Supabase

1. Create a new Supabase project.
2. Open the SQL editor.
3. Run the contents of `supabase/schema.sql`.
4. Create a storage bucket named `story-assets`.
5. Set the bucket to public read access so reader pages can display uploaded images.
6. Copy the project URL and anon key into `.env.local`.

Optional storage policy:

```sql
create policy "Public access for story-assets"
on storage.objects for select
using (bucket_id = 'story-assets');
```

## Local development

```bash
npm install
npm run dev
```

Then open:

- http://localhost:5173/

## Author testing

1. Open the app and choose a pet name.
2. Open the sidebar and click `Author Board`.
3. Enter the author key: `Starlight`.
4. Create a story and upload a cover.
5. Add a chapter and upload page images.
6. Publish the story.
7. Return to the home page and confirm the story appears.

## Reader testing

1. Choose a pet name in the welcome flow.
2. Open the Stories page and click a published story.
3. Open a chapter and page through the images.
4. Refresh the page and confirm the last page still loads from the saved progress.
5. Visit `Continue Reading` to resume from the bookmark.
6. Submit feedback from the Feedback page.

## Deployment

You can deploy the frontend to a static host such as Vercel or Netlify.

Recommended steps:

1. Push the project to GitHub.
2. Import the repo into Vercel or Netlify.
3. Add the same environment variables from `.env.local` in the host dashboard.
4. Build with the default command: `npm run build`.
5. Deploy the generated `dist` output.

## Notes

- No fake stories or sample images are included.
- The empty state appears automatically when there are no published stories.
- The app is intentionally simple and beginner-friendly.
