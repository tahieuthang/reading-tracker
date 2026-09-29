UPDATE `shelf_books`
SET `total_pages` = NULL,
    `page_count_source` = NULL,
    `updated_at` = CURRENT_TIMESTAMP(3)
WHERE `total_pages` = 0;
