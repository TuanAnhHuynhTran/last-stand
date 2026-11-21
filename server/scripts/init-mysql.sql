-- ============================================================
-- CITYVERSE - MySQL 8 Database Initialization Script (Phase 1)
-- ============================================================
-- Huong dan su dung truc tiep trong MySQL CLI / Workbench:
--   mysql -u root -p < server/scripts/init-mysql.sql
-- Hoac su dung script Node.js tu dong:
--   node server/scripts/setup-db.js
-- ============================================================

CREATE DATABASE IF NOT EXISTS `cityverse`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `cityverse`;

-- 1. Bang users
CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `username` VARCHAR(50) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `status` ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_email` (`email`),
  UNIQUE KEY `uniq_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Bang refresh_tokens (ho tro Refresh Token Rotation & reuse detection)
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `family_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `revoked_at` DATETIME NULL DEFAULT NULL,
  `replaced_by_token_id` CHAR(36) NULL DEFAULT NULL,
  `user_agent` VARCHAR(255) NULL DEFAULT NULL,
  `ip_address` VARCHAR(64) NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_refresh_tokens_token_hash` (`token_hash`),
  KEY `idx_refresh_tokens_user_id` (`user_id`),
  KEY `idx_refresh_tokens_family_id` (`family_id`),
  CONSTRAINT `fk_refresh_tokens_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Bang characters (moi user toi da 1 nhan vat o MVP)
CREATE TABLE IF NOT EXISTS `characters` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `name` VARCHAR(40) NOT NULL,
  `preset_id` VARCHAR(50) NOT NULL,
  `appearance` JSON NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_characters_user_id` (`user_id`),
  CONSTRAINT `fk_characters_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Bang cities (moi user toi da 1 thanh pho o MVP, map 128x128)
CREATE TABLE IF NOT EXISTS `cities` (
  `id` CHAR(36) NOT NULL,
  `owner_id` CHAR(36) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `terrain_type` ENUM('plains', 'coastal', 'highlands', 'valley') NOT NULL,
  `world_seed` VARCHAR(64) NOT NULL,
  `map_width` INT NOT NULL DEFAULT 128,
  `map_height` INT NOT NULL DEFAULT 128,
  `level` INT NOT NULL DEFAULT 1,
  `is_public` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_cities_owner_id` (`owner_id`),
  CONSTRAINT `fk_cities_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Bang city_members (phan quyen owner / co_mayor / visitor)
CREATE TABLE IF NOT EXISTS `city_members` (
  `id` CHAR(36) NOT NULL,
  `city_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `role` ENUM('owner', 'co_mayor', 'visitor') NOT NULL DEFAULT 'visitor',
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_city_members_city_user` (`city_id`, `user_id`),
  KEY `idx_city_members_user_id` (`user_id`),
  CONSTRAINT `fk_city_members_city`
    FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_city_members_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Bang city_economies (ngan sach khoi tao 250000 City Coins)
CREATE TABLE IF NOT EXISTS `city_economies` (
  `id` CHAR(36) NOT NULL,
  `city_id` CHAR(36) NOT NULL,
  `city_coins` BIGINT NOT NULL DEFAULT 250000,
  `population` INT NOT NULL DEFAULT 0,
  `happiness` INT NOT NULL DEFAULT 75,
  `tax_rate` DECIMAL(5,2) NOT NULL DEFAULT 8.00,
  `power_capacity` INT NOT NULL DEFAULT 0,
  `power_usage` INT NOT NULL DEFAULT 0,
  `water_capacity` INT NOT NULL DEFAULT 0,
  `water_usage` INT NOT NULL DEFAULT 0,
  `last_tick_at` DATETIME NULL DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_city_economies_city_id` (`city_id`),
  CONSTRAINT `fk_city_economies_city`
    FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Bang city_chunks (luu revision & delta dia hinh theo chunk 32x32 - Phase 2)
CREATE TABLE IF NOT EXISTS `city_chunks` (
  `id` CHAR(36) NOT NULL,
  `city_id` CHAR(36) NOT NULL,
  `chunk_x` INT NOT NULL,
  `chunk_z` INT NOT NULL,
  `revision` INT NOT NULL DEFAULT 1,
  `biome_summary` VARCHAR(32) NOT NULL DEFAULT 'grass',
  `seed_hash` VARCHAR(64) NOT NULL,
  `terrain_delta` JSON NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_city_chunks_city_coords` (`city_id`, `chunk_x`, `chunk_z`),
  KEY `idx_city_chunks_city_id` (`city_id`),
  CONSTRAINT `fk_city_chunks_city`
    FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
