export type Artifact = {
  video_id: string;
  video_title: string;
  type: string;
  start_time: number;
  end_time: number;
  clip_duration: number;
  quality_score: number;
  description: string;
  visual_style?: string;
  visual_topic?: string;
  color_palette?: string;
  tags?: string[];
  visible_text?: string;
  frame_url?: string | null;
  gif_url?: string | null;
};
