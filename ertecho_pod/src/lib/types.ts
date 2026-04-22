export interface Episode {
  id: number;
  wp_post_id: number;
  wp_media_id: number | null;
  title: string;
  description: string | null;
  published_at: Date;
  duration_seconds: number | null;
  file_size: number | null;
  filename: string | null;
  source_url: string | null;
  downloaded: boolean;
  created_at: Date;
}

export interface WpPost {
  id: number;
  date: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  acf: {
    audio_file: number | null;
    duration_in_seconds: number | null;
  };
}

export interface WpMedia {
  id: number;
  source_url: string;
  media_details: {
    filesize_in_bytes: number | null;
    length_formatted: string | null;
  };
}
