import { GENRES } from '../data/genres';

export default function sitemap() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://blackworld.vercel.app';

  // Base routes
  const routes = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];

  // Dynamic genre routes for Programmatic SEO
  const genreRoutes = GENRES.map((genre) => ({
    url: `${baseUrl}/games/${genre.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [...routes, ...genreRoutes];
}
