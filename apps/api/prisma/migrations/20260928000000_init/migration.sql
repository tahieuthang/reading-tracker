-- CreateTable
CREATE TABLE `shelf_books` (
    `id` CHAR(36) NOT NULL,
    `work_id` VARCHAR(32) NOT NULL,
    `edition_id` VARCHAR(32) NULL,
    `title` VARCHAR(512) NOT NULL,
    `authors` JSON NOT NULL,
    `cover_id` INTEGER NULL,
    `first_publish_year` INTEGER NULL,
    `description` TEXT NULL,
    `subjects` JSON NULL,
    `total_pages` INTEGER UNSIGNED NULL,
    `page_count_source` ENUM('EDITION', 'MANUAL') NULL,
    `current_page` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `status` ENUM('WANT_TO_READ', 'READING', 'READ') NOT NULL DEFAULT 'WANT_TO_READ',
    `rating` TINYINT UNSIGNED NULL,
    `note` VARCHAR(1000) NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shelf_books_work_id_key`(`work_id`),
    INDEX `shelf_books_status_deleted_at_idx`(`status`, `deleted_at`),
    INDEX `shelf_books_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
