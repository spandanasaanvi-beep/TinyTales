import { useEffect, useMemo, useState } from 'react';
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { hasSupabase, supabase, getAuthorKey } from './lib/supabase';
import type { Chapter, ChapterPage, FeedbackEntry, ReadingProgress, Story } from './types';

const PET_NAME_KEY = 'tinytales.pet_name';
const FEEDBACK_KEY = 'tinytales.feedback';
const STORIES_KEY = 'tinytales.stories';
const PROGRESS_KEY = 'tinytales.progress';

const defaultExamples = ['Starlight', 'Moonlight', 'Dreamer', 'Star', 'Luna'];

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getReaderName() {
  return readLocalStorage<string | null>(PET_NAME_KEY, null);
}

function setReaderName(name: string) {
  writeLocalStorage(PET_NAME_KEY, name.trim());
}

function getLocalStories(): Story[] {
  return readLocalStorage<Story[]>(STORIES_KEY, []);
}

function setLocalStories(stories: Story[]) {
  writeLocalStorage(STORIES_KEY, stories);
}

function getLocalFeedback(): FeedbackEntry[] {
  return readLocalStorage<FeedbackEntry[]>(FEEDBACK_KEY, []);
}

function setLocalFeedback(entries: FeedbackEntry[]) {
  writeLocalStorage(FEEDBACK_KEY, entries);
}

function getLocalProgress(): ReadingProgress[] {
  return readLocalStorage<ReadingProgress[]>(PROGRESS_KEY, []);
}

function setLocalProgress(progress: ReadingProgress[]) {
  writeLocalStorage(PROGRESS_KEY, progress);
}

function escapeBase64(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function sortPages(pages: ChapterPage[] = []) {
  return [...pages].sort((a, b) => a.page_order - b.page_order);
}

function sortChapters(chapters: Chapter[] = []) {
  return [...chapters].sort((a, b) => a.chapter_order - b.chapter_order);
}

function normalizeStory(story: Story): Story {
  return {
    ...story,
    chapters: story.chapters ? sortChapters(story.chapters).map((chapter) => ({
      ...chapter,
      pages: chapter.pages ? sortPages(chapter.pages) : [],
    })) : [],
  };
}

async function fetchPublishedStories(): Promise<Story[]> {
  if (supabase) {
    const [storyResult, chapterResult, pageResult] = await Promise.all([
      supabase.from('stories').select('*').eq('published', true).order('created_at', { ascending: false }),
      supabase.from('chapters').select('*').eq('published', true).order('chapter_order', { ascending: true }),
      supabase.from('chapter_pages').select('*').order('page_order', { ascending: true }),
    ]);

    if (storyResult.error) {
      console.error('Story fetch error', storyResult.error);
      return [];
    }

    const stories = (storyResult.data ?? []) as Story[];
    const chapters = (chapterResult.data ?? []) as Chapter[];
    const pages = (pageResult.data ?? []) as ChapterPage[];

    return stories.map((story) => {
      const storyChapters = chapters
        .filter((chapter) => chapter.story_id === story.id)
        .map((chapter) => ({
          ...chapter,
          pages: pages.filter((page) => page.chapter_id === chapter.id),
        }));

      return normalizeStory({ ...story, chapters: storyChapters });
    });
  }

  return getLocalStories()
    .filter((story) => story.published)
    .map((story) => normalizeStory(story));
}

async function fetchFeedbackEntries(): Promise<FeedbackEntry[]> {
  if (supabase) {
    const { data, error } = await supabase.from('feedback').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return (data ?? []) as FeedbackEntry[];
  }

  return getLocalFeedback();
}

async function fetchProgressEntries(): Promise<ReadingProgress[]> {
  if (supabase) {
    const petName = getReaderName();
    if (!petName) return [];

    const { data, error } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('pet_name', petName)
      .order('updated_at', { ascending: false });

    if (error) return [];
    return (data ?? []) as ReadingProgress[];
  }

  return getLocalProgress();
}

function createLocalStory(story: Omit<Story, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Story {
  const nextStory: Story = {
    id: story.id ?? crypto.randomUUID(),
    title: story.title,
    description: story.description ?? null,
    cover_url: story.cover_url ?? null,
    published: story.published,
    chapters: story.chapters ?? [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const stories = getLocalStories();
  const existingIndex = stories.findIndex((item) => item.id === nextStory.id);

  if (existingIndex >= 0) {
    stories[existingIndex] = nextStory;
  } else {
    stories.unshift(nextStory);
  }

  setLocalStories(stories);
  return nextStory;
}

async function uploadAssetToStorage(file: File, folder: string): Promise<string> {
  if (!supabase) {
    return URL.createObjectURL(file);
  }

  const fileName = `${crypto.randomUUID()}-${file.name.replace(/\s+/g, '-')}`;
  const { data, error } = await supabase.storage.from('story-assets').upload(`${folder}/${fileName}`, file, {
    cacheControl: '3600',
    upsert: true,
  });

  if (error) {
    throw error;
  }

  const { data: urlData } = supabase.storage.from('story-assets').getPublicUrl(data.path);
  return urlData.publicUrl;
}

async function createFeedbackEntry(entry: FeedbackEntry) {
  if (supabase) {
    const { error } = await supabase.from('feedback').insert({
      pet_name: entry.pet_name,
      feedback: entry.feedback,
    });
    if (error) throw error;
    return;
  }

  const entries = getLocalFeedback();
  entries.unshift({ ...entry, id: crypto.randomUUID(), created_at: new Date().toISOString() });
  setLocalFeedback(entries);
}

async function saveProgress(progress: ReadingProgress) {
  if (supabase) {
    const petName = getReaderName();
    const record = {
      pet_name: petName ?? progress.pet_name,
      story_id: progress.story_id,
      chapter_id: progress.chapter_id,
      page_index: progress.page_index,
    };

    const { data, error } = await supabase
      .from('reading_progress')
      .upsert({ ...record, id: progress.id }, { onConflict: 'pet_name,story_id,chapter_id' })
      .select();

    if (error) throw error;
    return data?.[0] ?? record;
  }

  const current = getLocalProgress();
  const next = current.filter(
    (item) => !(item.pet_name === progress.pet_name && item.story_id === progress.story_id && item.chapter_id === progress.chapter_id),
  );
  next.unshift({ ...progress, id: progress.id ?? crypto.randomUUID() });
  setLocalProgress(next);
  return progress;
}

function App() {
  const [petName, setPetName] = useState<string | null>(getReaderName());
  const [stories, setStories] = useState<Story[]>([]);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const storyData = await fetchPublishedStories();
      const feedbackData = await fetchFeedbackEntries();
      setStories(storyData);
      setFeedback(feedbackData);
      setLoading(false);
    };

    loadData();
  }, [location.pathname]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!petName) {
    return <PetNameGate setPetName={setPetName} />;
  }

  return (
    <div className="app-shell">
      <div className="background-glow glow-one" />
      <div className="background-glow glow-two" />
      <div className="background-glow glow-three" />

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} petName={petName} />

      <div className="main-column">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
            ☰
          </button>
          <div className="brand-block">
            <Link to="/" className="brand-link">TinyTales</Link>
            <span className="brand-tag">Stories by Starlight</span>
          </div>
          <div className="topbar-pill">
            {petName ? `Welcome, ${petName}` : 'Choose your pet name'}
          </div>
        </header>

        <main className="content-area">
          <Routes>
            <Route index element={<HomePage petName={petName} stories={stories} loading={loading} />} />
            <Route path="/stories" element={<StoriesPage stories={stories} loading={loading} />} />
            <Route path="/stories/:storyId" element={<StoryDetailPage stories={stories} />} />
            <Route path="/stories/:storyId/:chapterId" element={<ChapterReaderPage stories={stories} />} />
            <Route path="/bookmarks" element={<BookmarksPage stories={stories} />} />
            <Route path="/profile" element={<ProfilePage petName={petName} setPetName={setPetName} />} />
            <Route path="/feedback" element={<FeedbackPage />} />
            <Route path="/author" element={<AuthorAccessPage />} />
            <Route path="/author/dashboard" element={<AuthorDashboardPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function StarBackdrop() {
  return (
    <div className="star-backdrop" aria-hidden="true">
      <span className="large-pink-star star-a" />
      <span className="large-pink-star star-b" />
      <span className="large-pink-star star-c" />
      <span className="large-pink-star star-d" />
      <span className="large-pink-star star-e" />
      <span className="large-pink-star star-f" />
      <span className="large-pink-star star-g" />
    </div>
  );
}

function PetNameGate({ setPetName }: { setPetName: (value: string | null) => void }) {
  const [draft, setDraft] = useState('');

  const handleSave = () => {
    const value = draft.trim();
    if (!value) return;
    setReaderName(value);
    setPetName(value);
  };

  return (
    <div className="pet-name-gate">
      <StarBackdrop />
      <div className="form-card gate-card">
        <p className="eyebrow">TinyTales</p>
        <h1>Choose your pet name</h1>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type your pet name"
          maxLength={24}
        />

        <div className="example-chips">
          {defaultExamples.map((example) => (
            <button type="button" key={example} className="chip-button" onClick={() => setDraft(example)}>
              {example}
            </button>
          ))}
        </div>

        <button onClick={handleSave}>Enter TinyTales</button>
      </div>
    </div>
  );
}

function Sidebar({ open, onClose, petName }: { open: boolean; onClose: () => void; petName: string | null }) {
  const navItems = [
    { label: 'Home', path: '/', icon: '🏠' },
    { label: 'Stories', path: '/stories', icon: '📚' },
    { label: 'Bookmarks / Continue Reading', path: '/bookmarks', icon: '🔖' },
    { label: 'Profile', path: '/profile', icon: '👤' },
    { label: 'Feedback', path: '/feedback', icon: '💬' },
    { label: 'Author Board', path: '/author', icon: '✍️' },
    { label: 'About TinyTales', path: '/about', icon: 'ℹ️' },
  ];

  return (
    <>
      <div className={`sidebar-overlay ${open ? 'active' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div>
            <p className="eyebrow">TinyTales</p>
            <h3>{petName || 'Dreamer'}</h3>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close sidebar">
            ✕
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              end={item.path === '/'}
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}

function HomePage({ petName, stories, loading }: { petName: string | null; stories: Story[]; loading: boolean }) {
  const welcomeName = petName || 'Dreamer';

  return (
    <div className="page page-with-stars">
      <StarBackdrop />
      <section className="hero-card">
        <div className="floating-stars" aria-hidden="true">
          <span className="star star-one" />
          <span className="star star-two" />
          <span className="star star-three" />
          <span className="star star-four" />
        </div>
        <p className="eyebrow">Magical reading</p>
        <h1>Welcome To TinyTales, {welcomeName}</h1>
        <p className="muted">
          Open a new story, turn the pages, and let your imagination drift through a world of wonder.
        </p>
      </section>

      <section className="section-block">
        <div className="section-header-row">
          <h2>Stories</h2>
          <Link to="/stories" className="link-button">View all</Link>
        </div>

        {loading ? (
          <div className="empty-state">Loading stories…</div>
        ) : stories.length === 0 ? (
          <div className="empty-state">
            <h3>No stories yet.</h3>
            <p>New TinyTales are waiting to be written.</p>
          </div>
        ) : (
          <div className="story-grid compact-grid">
            {stories.slice(0, 3).map((story) => (
              <StoryCard key={story.id} story={story} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StoriesPage({ stories, loading }: { stories: Story[]; loading: boolean }) {
  return (
    <div className="page">
      <div className="section-header-row">
        <h1>Stories</h1>
      </div>

      {loading ? (
        <div className="empty-state">Loading stories…</div>
      ) : stories.length === 0 ? (
        <div className="empty-state">
          <h3>No TinyTales have been published yet.</h3>
          <p>When the author uploads a real story, it will appear here automatically.</p>
        </div>
      ) : (
        <div className="story-grid">
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} />
          ))}
        </div>
      )}
    </div>
  );
}

function StoryCard({ story }: { story: Story }) {
  const chapters = story.chapters ?? [];
  const chapterCount = chapters.length;
  const progress = getProgressForStory(story.id);

  return (
    <Link to={`/stories/${story.id}`} className="story-card">
      <div className="story-cover-wrap">
        {story.cover_url ? (
          <img src={story.cover_url} alt={story.title} className="story-cover" />
        ) : (
          <div className="story-cover placeholder-cover">No cover uploaded</div>
        )}
      </div>

      <div className="story-card-body">
        <h3>{story.title}</h3>
        {story.description ? <p>{story.description}</p> : null}
        <div className="story-meta-row">
          <span>{chapterCount} chapter{chapterCount === 1 ? '' : 's'}</span>
          {progress ? <span>Continue: chapter {progress.page_index + 1}</span> : null}
        </div>
      </div>
    </Link>
  );
}

function StoryDetailPage({ stories }: { stories: Story[] }) {
  const { storyId } = useParams();
  const navigate = useNavigate();
  const story = stories.find((entry) => entry.id === storyId);

  if (!story) {
    return <div className="empty-state">Story not found.</div>;
  }

  const chapters = story.chapters ?? [];

  return (
    <div className="page story-detail-page">
      <button className="back-button" onClick={() => navigate(-1)}>← Back</button>

      <div className="detail-header">
        <div className="detail-cover-wrap">
          {story.cover_url ? (
            <img src={story.cover_url} alt={story.title} className="detail-cover" />
          ) : (
            <div className="detail-cover placeholder-cover">No cover uploaded</div>
          )}
        </div>

        <div className="detail-copy">
          <p className="eyebrow">Story</p>
          <h1>{story.title}</h1>
          {story.description ? <p>{story.description}</p> : <p className="muted">No story description has been added yet.</p>}
        </div>
      </div>

      <section className="section-block">
        <h2>Chapters</h2>
        {chapters.length === 0 ? (
          <div className="empty-state small">No chapters are available yet.</div>
        ) : (
          <div className="chapter-list">
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                className="chapter-item"
                onClick={() => navigate(`/stories/${story.id}/${chapter.id}`)}
              >
                <span>{chapter.title}</span>
                <small>{chapter.pages?.length ?? 0} pages</small>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ChapterReaderPage({ stories }: { stories: Story[] }) {
  const { storyId, chapterId } = useParams();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(0);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);

  const story = stories.find((entry) => entry.id === storyId);
  const chapters = story?.chapters ?? [];
  const chapter = chapters.find((entry) => entry.id === chapterId);
  const pages = sortPages(chapter?.pages ?? []);

  useEffect(() => {
    const readerName = getReaderName();
    if (!story || !chapter || !readerName) {
      return;
    }

    const saved = getLocalProgress().find(
      (item) => item.pet_name === readerName && item.story_id === story.id && item.chapter_id === chapter.id,
    );

    if (saved) {
      setCurrentPage(saved.page_index);
      setProgress(saved);
    }
  }, [story, chapter]);

  useEffect(() => {
    if (!story || !chapter) return;
    const petName = getReaderName();
    if (!petName) return;

    const entry = {
      pet_name: petName,
      story_id: story.id,
      chapter_id: chapter.id,
      page_index: currentPage,
      id: progress?.id,
    };

    saveProgress(entry).then((result) => setProgress({ ...entry, id: result.id ?? entry.id }));
  }, [currentPage, story, chapter]);

  if (!story || !chapter) {
    return <div className="empty-state">Chapter not found.</div>;
  }

  const currentImage = pages[currentPage]?.image_url;

  return (
    <div className="page reader-page">
      <div className="reader-topbar">
        <button className="back-button" onClick={() => navigate(`/stories/${story.id}`)}>← Exit</button>
        <div className="reader-heading">
          <h2>{story.title}</h2>
          <p>{chapter.title}</p>
        </div>
        <div className="page-badge">
          {currentPage + 1} / {pages.length || 1}
        </div>
      </div>

      <div className="reader-image-wrap">
        {currentImage ? (
          <img src={currentImage} alt={`${chapter.title} page ${currentPage + 1}`} className="reader-image" />
        ) : (
          <div className="empty-state reader-empty">No page images have been uploaded for this chapter yet.</div>
        )}
      </div>

      <div className="reader-controls">
        <button disabled={currentPage === 0} onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}>
          Previous page
        </button>
        <button
          disabled={currentPage >= (pages.length - 1)}
          onClick={() => setCurrentPage((page) => Math.min(pages.length - 1, page + 1))}
        >
          Next page
        </button>
      </div>
    </div>
  );
}

function BookmarksPage({ stories }: { stories: Story[] }) {
  const petName = getReaderName();
  const savedProgress = getLocalProgress().filter((item) => item.pet_name === petName);

  if (!petName) {
    return <div className="empty-state">Choose your pet name to keep bookmarks and reading progress.</div>;
  }

  return (
    <div className="page page-with-stars">
      <StarBackdrop />
      <h1>Continue Reading</h1>
      {savedProgress.length === 0 ? (
        <div className="empty-state">No saved pages yet. Open a story and begin reading.</div>
      ) : (
        <div className="bookmark-list">
          {savedProgress.map((progress) => {
            const story = stories.find((entry) => entry.id === progress.story_id);
            const chapter = story?.chapters?.find((entry) => entry.id === progress.chapter_id);
            if (!story || !chapter) return null;

            return (
              <Link to={`/stories/${story.id}/${chapter.id}`} key={`${story.id}-${chapter.id}`} className="bookmark-item">
                <div>
                  <strong>{story.title}</strong>
                  <p>{chapter.title}</p>
                </div>
                <span>Page {progress.page_index + 1}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProfilePage({ petName, setPetName }: { petName: string | null; setPetName: (value: string | null) => void }) {
  const [draft, setDraft] = useState(petName ?? '');

  const saveProfile = () => {
    const value = draft.trim();
    if (!value) return;
    setReaderName(value);
    setPetName(value);
  };

  return (
    <div className="page page-with-stars">
      <StarBackdrop />
      <h1>Profile</h1>
      <div className="form-card">
        <label className="field-label">Pet Name</label>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="My pet name" />
        <button onClick={saveProfile}>Save</button>
        <div className="current-name-box">{petName || 'No pet name selected yet'}</div>
      </div>
    </div>
  );
}

function FeedbackPage() {
  const [petName, setPetName] = useState(getReaderName() ?? '');
  const [feedbackText, setFeedbackText] = useState('');
  const [saved, setSaved] = useState(false);

  const sendFeedback = async () => {
    if (!petName.trim() || !feedbackText.trim()) return;
    setReaderName(petName.trim());
    await createFeedbackEntry({ pet_name: petName.trim(), feedback: feedbackText.trim() });
    setSaved(true);
    setFeedbackText('');
  };

  return (
    <div className="page page-with-stars">
      <StarBackdrop />
      <h1>Feedback</h1>
      <div className="form-card">
        <label className="field-label">Pet Name</label>
        <input value={petName} onChange={(event) => setPetName(event.target.value)} />

        <label className="field-label">Feedback</label>
        <textarea value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} rows={5} />

        <button onClick={sendFeedback}>Submit Feedback</button>
        {saved ? <p className="success-text">Thank you! Your feedback was saved.</p> : null}
      </div>
    </div>
  );
}

function AuthorAccessPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = () => {
    if (password === getAuthorKey()) {
      navigate('/author/dashboard');
      return;
    }

    setError('Incorrect author key. Try again.');
  };

  return (
    <div className="page auth-page page-with-stars">
      <StarBackdrop />
      <div className="form-card center-card">
        <p className="eyebrow">Author access</p>
        <h1>Enter Author Key</h1>
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="********" />
        <button onClick={handleSubmit}>Enter</button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </div>
  );
}

function AuthorDashboardPage() {
  const [storyForm, setStoryForm] = useState({ title: '', description: '', coverFile: null as File | null, previewUrl: '' });
  const [storyDraft, setStoryDraft] = useState<Story | null>(null);
  const [chapterDraft, setChapterDraft] = useState({ title: '', files: [] as File[] });
  const [stories, setStories] = useState<Story[]>(getLocalStories().filter((story) => story.id));
  const [feedback, setFeedback] = useState<FeedbackEntry[]>(getLocalFeedback());

  const updateStoryList = () => {
    setStories(getLocalStories());
  };

  useEffect(() => {
    fetchPublishedStories().then(setStories);
    fetchFeedbackEntries().then(setFeedback);
  }, []);

  const handleCoverPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;

    try {
      const uploadedUrl = await uploadAssetToStorage(file, 'covers');
      setStoryForm((prev) => ({ ...prev, coverFile: file, previewUrl: uploadedUrl }));
    } catch (error) {
      console.error('Cover upload failed', error);
      setStoryForm((prev) => ({ ...prev, coverFile: file, previewUrl: URL.createObjectURL(file) }));
    }
  };

  const handleChapterFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setChapterDraft((prev) => ({ ...prev, files }));
  };

  const createStory = () => {
    if (!storyForm.title.trim()) return;

    const story = createLocalStory({
      title: storyForm.title.trim(),
      description: storyForm.description.trim(),
      cover_url: storyForm.previewUrl || null,
      published: false,
      chapters: [],
    });

    setStoryDraft(story);
    setStoryForm({ title: '', description: '', coverFile: null, previewUrl: '' });
    updateStoryList();
  };

  const publishStory = () => {
    if (!storyDraft) return;
    const list = getLocalStories();
    const nextStory = { ...storyDraft, published: true, updated_at: new Date().toISOString() };
    setLocalStories(list.map((story) => (story.id === nextStory.id ? nextStory : story)));
    setStoryDraft(nextStory);
    updateStoryList();
  };

  const addChapter = async () => {
    if (!storyDraft || !chapterDraft.title.trim()) return;
    const chapters = storyDraft.chapters ?? [];
    const nextChapter: Chapter = {
      id: crypto.randomUUID(),
      story_id: storyDraft.id,
      title: chapterDraft.title.trim(),
      chapter_order: chapters.length + 1,
      published: true,
      pages: [],
    };

    const localStories = getLocalStories();
    const updated = localStories.map((story) => {
      if (story.id !== storyDraft.id) return story;
      return { ...story, chapters: [...(story.chapters ?? []), nextChapter], updated_at: new Date().toISOString() };
    });

    setLocalStories(updated);

    const previews = await Promise.all(
      chapterDraft.files.map(async (file) => {
        const imageUrl = await uploadAssetToStorage(file, 'chapter-pages');
        return {
          id: crypto.randomUUID(),
          chapter_id: nextChapter.id,
          image_url: imageUrl,
          page_order: 0,
        };
      }),
    );

    const pageList = previews.map((page, index) => ({ ...page, page_order: index + 1 }));
    nextChapter.pages = pageList;
    const finalStories = updated.map((story) =>
      story.id === storyDraft.id
        ? { ...story, chapters: story.chapters?.map((chapter) => (chapter.id === nextChapter.id ? nextChapter : chapter)) }
        : story,
    );

    setLocalStories(finalStories);
    setStoryDraft({ ...storyDraft, chapters: [...chapters, nextChapter] });
    setChapterDraft({ title: '', files: [] });
    updateStoryList();
  };

  return (
    <div className="page author-dashboard page-with-stars">
      <StarBackdrop />
      <h1>Author Dashboard</h1>

      <section className="author-grid">
        <div className="form-card">
          <h2>Create Story</h2>
          <label className="field-label">Story title</label>
          <input value={storyForm.title} onChange={(event) => setStoryForm({ ...storyForm, title: event.target.value })} />

          <label className="field-label">Story description</label>
          <textarea value={storyForm.description} onChange={(event) => setStoryForm({ ...storyForm, description: event.target.value })} rows={4} />

          <label className="field-label">Upload story cover</label>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleCoverPick} />
          {storyForm.previewUrl ? <img src={storyForm.previewUrl} alt="preview" className="preview-image" /> : null}

          <button onClick={createStory}>Save story draft</button>
          {storyDraft ? (
            <div className="draft-box">
              <strong>{storyDraft.title}</strong>
              {storyDraft.published ? <span>Published</span> : <span>Draft</span>}
              <button onClick={publishStory}>Publish story</button>
            </div>
          ) : null}
        </div>

        <div className="form-card">
          <h2>Add Chapter</h2>
          <label className="field-label">Chapter title</label>
          <input value={chapterDraft.title} onChange={(event) => setChapterDraft({ ...chapterDraft, title: event.target.value })} />

          <label className="field-label">Upload chapter pages</label>
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handleChapterFiles} />
          {chapterDraft.files.length > 0 ? <p>{chapterDraft.files.length} page images selected</p> : null}

          <button onClick={addChapter}>Add chapter</button>
        </div>
      </section>

      <section className="section-block">
        <h2>Published Stories</h2>
        {stories.length === 0 ? (
          <div className="empty-state">No stories uploaded yet.</div>
        ) : (
          <div className="story-grid compact-grid">
            {stories.map((story) => (
              <div key={story.id} className="mini-story-card">
                <h3>{story.title}</h3>
                <p>{story.chapters?.length ?? 0} chapters</p>
                <p>{story.published ? 'Published' : 'Draft'}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section-block">
        <h2>Feedback</h2>
        {feedback.length === 0 ? (
          <div className="empty-state">No reader feedback yet.</div>
        ) : (
          <div className="feedback-list">
            {feedback.map((entry) => (
              <div key={entry.id ?? `${entry.pet_name}-${entry.created_at}`} className="feedback-item">
                <strong>{entry.pet_name}</strong>
                <p>{entry.feedback}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AboutPage() {
  return (
    <div className="page page-with-stars">
      <StarBackdrop />
      <h1>About TinyTales</h1>
      <div className="form-card">
        <p>
          TinyTales is a magical reading space where a single author can share image-based stories and readers can continue their journey page by page.
        </p>
        <p>
          Every story, chapter, and page is designed to feel like a digital storybook, with progress saved automatically so readers can continue where they left off.
        </p>
      </div>
    </div>
  );
}

function getProgressForStory(storyId: string) {
  const petName = getReaderName();
  if (!petName) return null;
  return getLocalProgress().find((item) => item.pet_name === petName && item.story_id === storyId) ?? null;
}

export default App;
