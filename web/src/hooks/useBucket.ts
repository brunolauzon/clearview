import { useEffect, useState } from 'react';

export type Bucket = 'sm' | 'md' | 'lg';

export const BUCKET_ORDER: Record<Bucket, number> = { sm: 0, md: 1, lg: 2 };

export function bucketFor(width: number): Bucket {
  return width < 720 ? 'sm' : width < 1050 ? 'md' : 'lg';
}

/** Coarse viewport size, so tables can drop columns instead of wrapping. */
export function useBucket(): Bucket {
  const [bucket, setBucket] = useState<Bucket>(() => bucketFor(window.innerWidth));
  useEffect(() => {
    const onResize = () => setBucket(bucketFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return bucket;
}

/** Re-render every `ms` so relative times ("3h ago") stay fresh. */
export function useNow(ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
