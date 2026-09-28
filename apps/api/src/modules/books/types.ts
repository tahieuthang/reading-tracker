export interface OpenLibrarySearchDocument {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
}

export interface OpenLibrarySearchResponse {
  docs: OpenLibrarySearchDocument[];
  numFound?: number;
  num_found?: number;
}

export interface OpenLibraryWork {
  key?: string;
  title?: string;
  description?: string | { value?: string };
  covers?: number[];
  subjects?: string[];
  authors?: Array<{ author?: { key?: string } }>;
  first_publish_date?: string;
}

export interface OpenLibraryEdition {
  key?: string;
  title?: string;
  publish_date?: string;
  number_of_pages?: number;
  covers?: number[];
}

export interface OpenLibraryEditionsResponse {
  entries?: OpenLibraryEdition[];
}

export interface OpenLibraryAuthor {
  name?: string;
}

export interface BookSearchItem {
  workId: string;
  title: string;
  authors: string[];
  firstPublishYear: number | null;
  coverId: number | null;
  coverUrl: string | null;
  inShelf: boolean;
  hasArchivedProgress: boolean;
}

export interface BookEdition {
  editionId: string;
  title: string;
  publishDate: string | null;
  numberOfPages: number | null;
  coverId: number | null;
}

export interface BookDetail extends BookSearchItem {
  description: string | null;
  subjects: string[];
  editions: BookEdition[];
}
