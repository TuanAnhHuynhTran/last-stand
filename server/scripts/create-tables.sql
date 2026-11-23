-- ============================================================
-- CITYVERSE - MySQL 8  |  Create Tables Script
-- ============================================================
-- Script nay chi TAO BANG, khong xoa du lieu hien co.
-- Su dung CREATE TABLE IF NOT EXISTS - an toan chay nhieu lan.
--
-- Cach su dung:
--   mysql -u root -p < server/scripts/create-tables.sql
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- ------------------------------------------------------------
-- Tao / chon database
-- ------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `cityverse`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `cityverse`;

-- ============================================================
-- BANG 1: users
-- ============================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id`            CHAR(36)                   NOT NULL,
  `email`         VARCHAR(255)               NOT NULL,
  `username`      VARCHAR(50)                NOT NULL,
  `password_hash` VARCHAR(255)               NOT NULL,
  `status`        ENUM('active','suspended') NOT NULL DEFAULT 'active',
  `created_at`    DATETIME                   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME                   NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                      ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_email`    (`email`),
  UNIQUE KEY `uniq_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 2: refresh_tokens
-- Ho tro Refresh Token Rotation & reuse detection
-- ============================================================
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id`                   CHAR(36)     NOT NULL,
  `user_id`              CHAR(36)     NOT NULL,
  `token_hash`           VARCHAR(255) NOT NULL,
  `family_id`            CHAR(36)     NOT NULL,
  `expires_at`           DATETIME     NOT NULL,
  `revoked_at`           DATETIME     NULL DEFAULT NULL,
  `replaced_by_token_id` CHAR(36)     NULL DEFAULT NULL,
  `user_agent`           VARCHAR(255) NULL DEFAULT NULL,
  `ip_address`           VARCHAR(64)  NULL DEFAULT NULL,
  `created_at`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_refresh_tokens_token_hash` (`token_hash`),
  KEY `idx_refresh_tokens_user_id`   (`user_id`),
  KEY `idx_refresh_tokens_family_id` (`family_id`),
  CONSTRAINT `fk_refresh_tokens_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 3: characters
-- Moi user toi da 1 nhan vat o MVP (UNIQUE user_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS `characters` (
  `id`         CHAR(36)    NOT NULL,
  `user_id`    CHAR(36)    NOT NULL,
  `name`       VARCHAR(40) NOT NULL,
  `preset_id`  VARCHAR(50) NOT NULL,
  `appearance` JSON        NOT NULL,
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_characters_user_id` (`user_id`),
  CONSTRAINT `fk_characters_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 4: cities
-- Moi user toi da 1 thanh pho o MVP, map mac dinh 128x128
-- ============================================================
CREATE TABLE IF NOT EXISTS `cities` (
  `id`           CHAR(36)                                      NOT NULL,
  `owner_id`     CHAR(36)                                      NOT NULL,
  `name`         VARCHAR(60)                                   NOT NULL,
  `terrain_type` ENUM('plains','coastal','highlands','valley') NOT NULL,
  `world_seed`   VARCHAR(64)                                   NOT NULL,
  `map_width`    INT                                           NOT NULL DEFAULT 128,
  `map_height`   INT                                           NOT NULL DEFAULT 128,
  `level`        INT                                           NOT NULL DEFAULT 1,
  `is_public`    TINYINT(1)                                    NOT NULL DEFAULT 1,
  `visibility`   VARCHAR(16)                                   NOT NULL DEFAULT 'public',
  `created_at`   DATETIME                                      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME                                      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                                        ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_cities_owner_id` (`owner_id`),
  CONSTRAINT `fk_cities_owner`
    FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 5: city_members
-- Phan quyen thanh vien: owner / co_mayor / visitor
-- ============================================================
CREATE TABLE IF NOT EXISTS `city_members` (
  `id`         CHAR(36)                           NOT NULL,
  `city_id`    CHAR(36)                           NOT NULL,
  `user_id`    CHAR(36)                           NOT NULL,
  `role`       ENUM('owner','co_mayor','visitor') NOT NULL DEFAULT 'visitor',
  `joined_at`  DATETIME                           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME                           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME                           NOT NULL DEFAULT CURRENT_TIMESTAMP
                                                           ON UPDATE CURRENT_TIMESTAMP,
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

-- ============================================================
-- BANG 6: city_economies
-- Ngan sach khoi tao: 250.000 City Coins, happiness 75
-- ============================================================
CREATE TABLE IF NOT EXISTS `city_economies` (
  `id`             CHAR(36)     NOT NULL,
  `city_id`        CHAR(36)     NOT NULL,
  `city_coins`     BIGINT       NOT NULL DEFAULT 250000,
  `population`     INT          NOT NULL DEFAULT 0,
  `happiness`      INT          NOT NULL DEFAULT 75,
  `tax_rate`       DECIMAL(5,2) NOT NULL DEFAULT 8.00,
  `power_capacity` INT          NOT NULL DEFAULT 0,
  `power_usage`    INT          NOT NULL DEFAULT 0,
  `water_capacity` INT          NOT NULL DEFAULT 0,
  `water_usage`    INT          NOT NULL DEFAULT 0,
  `last_tick_at`   DATETIME     NULL DEFAULT NULL,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                         ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_city_economies_city_id` (`city_id`),
  CONSTRAINT `fk_city_economies_city`
    FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 7: city_chunks
-- Luu terrain delta theo chunk 32x32
-- ============================================================
CREATE TABLE IF NOT EXISTS `city_chunks` (
  `id`            CHAR(36)    NOT NULL,
  `city_id`       CHAR(36)    NOT NULL,
  `chunk_x`       INT         NOT NULL,
  `chunk_z`       INT         NOT NULL,
  `revision`      INT         NOT NULL DEFAULT 1,
  `biome_summary` VARCHAR(32) NOT NULL DEFAULT 'grass',
  `seed_hash`     VARCHAR(64) NOT NULL,
  `terrain_delta` JSON        NOT NULL,
  `created_at`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                       ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_city_chunks_city_coords` (`city_id`, `chunk_x`, `chunk_z`),
  KEY `idx_city_chunks_city_id` (`city_id`),
  CONSTRAINT `fk_city_chunks_city`
    FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 8: building_types
-- Phase 3 – catalogue loai cong trinh (seed tu @cityverse/shared khi server chay)
-- ============================================================
CREATE TABLE IF NOT EXISTS `building_types` (
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `footprint` json NOT NULL,
  `max_per_city` int DEFAULT NULL,
  `max_level` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 9: building_levels
-- Phase 3 – cap do tung loai cong trinh
-- ============================================================
CREATE TABLE IF NOT EXISTS `building_levels` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level` int NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `cost` json NOT NULL,
  `build_seconds` int NOT NULL,
  `stats` json NOT NULL,
  `model_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_building_levels_type_level` (`type_code`,`level`),
  CONSTRAINT `building_levels_ibfk_1` FOREIGN KEY (`type_code`) REFERENCES `building_types` (`code`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 10: world_buildings
-- Phase 3 – cong trinh da dat (id giu nguyen khi nang cap / di chuyen)
-- ============================================================
CREATE TABLE IF NOT EXISTS `world_buildings` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level` int NOT NULL DEFAULT '1',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'constructing',
  `anchor_q` int NOT NULL,
  `anchor_r` int NOT NULL,
  `rotation` tinyint NOT NULL DEFAULT '0',
  `created_by` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invested` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `type_code` (`type_code`),
  KEY `idx_world_buildings_city` (`city_id`),
  CONSTRAINT `world_buildings_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `world_buildings_ibfk_2` FOREIGN KEY (`type_code`) REFERENCES `building_types` (`code`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 11: building_footprints
-- Phase 3 – moi o hex bi chiem; UNIQUE(city_id, q, r) chong de cong trinh
-- ============================================================
CREATE TABLE IF NOT EXISTS `building_footprints` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `building_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `q` int NOT NULL,
  `r` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_building_footprints_city_hex` (`city_id`,`q`,`r`),
  KEY `idx_building_footprints_building` (`building_id`),
  CONSTRAINT `building_footprints_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `building_footprints_ibfk_2` FOREIGN KEY (`building_id`) REFERENCES `world_buildings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 12: building_construction_jobs
-- Phase 3 – lenh xay / nang cap co thoi gian
-- ============================================================
CREATE TABLE IF NOT EXISTS `building_construction_jobs` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `building_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `job_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_level` int NOT NULL,
  `target_level` int NOT NULL,
  `cost` json NOT NULL,
  `started_at` datetime NOT NULL,
  `finishes_at` datetime NOT NULL,
  `completed_at` datetime DEFAULT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'in_progress',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_construction_jobs_city_status` (`city_id`,`status`),
  KEY `idx_construction_jobs_building` (`building_id`),
  CONSTRAINT `building_construction_jobs_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `building_construction_jobs_ibfk_2` FOREIGN KEY (`building_id`) REFERENCES `world_buildings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 13: city_resources
-- Phase 3/4 – go, da va nong san (lua, ngo, rau, trai cay, co kho)
-- ============================================================
CREATE TABLE IF NOT EXISTS `city_resources` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` bigint NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_city_resources_city_code` (`city_id`,`resource_code`),
  CONSTRAINT `city_resources_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 14: crop_types
-- Phase 4 – catalogue cay trong (seed tu @cityverse/shared khi server chay)
-- ============================================================
CREATE TABLE IF NOT EXISTS `crop_types` (
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `produce` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `grow_seconds` int NOT NULL,
  `yield_per_hex` int NOT NULL,
  `water_need` float NOT NULL DEFAULT '0',
  `seed_cost_per_hex` json NOT NULL,
  `stages` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 15: farm_zones
-- Phase 4 – khu canh tac (>= 6 hex lien nhau, cap 1..3)
-- ============================================================
CREATE TABLE IF NOT EXISTS `farm_zones` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `level` int NOT NULL DEFAULT '1',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `upgrade_started_at` datetime DEFAULT NULL,
  `upgrade_finishes_at` datetime DEFAULT NULL,
  `created_by` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invested` json NOT NULL,
  `total_harvested` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_farm_zones_city` (`city_id`),
  CONSTRAINT `farm_zones_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 16: farm_zone_tiles
-- Phase 4 – moi o hex cua khu; UNIQUE(city_id, q, r) chong chong lan
-- ============================================================
CREATE TABLE IF NOT EXISTS `farm_zone_tiles` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `q` int NOT NULL,
  `r` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_farm_zone_tiles_city_hex` (`city_id`,`q`,`r`),
  KEY `idx_farm_zone_tiles_zone` (`zone_id`),
  CONSTRAINT `farm_zone_tiles_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `farm_zone_tiles_ibfk_2` FOREIGN KEY (`zone_id`) REFERENCES `farm_zones` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 17: crop_cycles
-- Phase 4 – vu mua: gieo -> lon -> thu hoach
-- ============================================================
CREATE TABLE IF NOT EXISTS `crop_cycles` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `crop_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_level` int NOT NULL,
  `hex_count` int NOT NULL,
  `planted_at` datetime NOT NULL,
  `ready_at` datetime NOT NULL,
  `expected_yield` int NOT NULL,
  `water_factor` float NOT NULL DEFAULT '1',
  `seed_cost` json NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'growing',
  `harvested_at` datetime DEFAULT NULL,
  `harvested_amount` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `crop_code` (`crop_code`),
  KEY `idx_crop_cycles_zone_status` (`zone_id`,`status`),
  KEY `idx_crop_cycles_city` (`city_id`),
  CONSTRAINT `crop_cycles_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `crop_cycles_ibfk_2` FOREIGN KEY (`zone_id`) REFERENCES `farm_zones` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `crop_cycles_ibfk_3` FOREIGN KEY (`crop_code`) REFERENCES `crop_types` (`code`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 18: irrigation_networks
-- Phase 4 – mang thuy loi / cap nuoc cua tung khu
-- ============================================================
CREATE TABLE IF NOT EXISTS `irrigation_networks` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `source_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'rain',
  `source_q` int DEFAULT NULL,
  `source_r` int DEFAULT NULL,
  `source_distance` int DEFAULT NULL,
  `natural_supply` float NOT NULL DEFAULT '0',
  `supply` float NOT NULL DEFAULT '0',
  `fertility` float NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_irrigation_networks_zone` (`zone_id`),
  KEY `city_id` (`city_id`),
  CONSTRAINT `irrigation_networks_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `irrigation_networks_ibfk_2` FOREIGN KEY (`zone_id`) REFERENCES `farm_zones` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 19: animal_species
-- Phase 5 – loai vat nuoi: sinh truong, tuoi tho, an uong, san pham, giong (seed tu @cityverse/shared)
-- ============================================================
CREATE TABLE IF NOT EXISTS `animal_species` (
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `farm_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` int NOT NULL,
  `grow_seconds` int NOT NULL,
  `lifespan_seconds` int NOT NULL,
  `capacity_per_hex` float NOT NULL,
  `feed_per_minute` float NOT NULL,
  `water_per_minute` float NOT NULL,
  `products` json NOT NULL,
  `meat_yield` int NOT NULL,
  `production_seconds` int NOT NULL,
  `breed_seconds` int NOT NULL,
  `animals_per_caretaker` int NOT NULL,
  `breeds` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 20: animal_feed_recipes
-- Phase 5 – cong thuc thuc an: nong san -> dinh duong (seed tu @cityverse/shared)
-- ============================================================
CREATE TABLE IF NOT EXISTS `animal_feed_recipes` (
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `ingredients` json NOT NULL,
  `nutrition` int NOT NULL,
  `quality` float NOT NULL DEFAULT '0',
  `species` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 21: livestock_farms
-- Phase 5 – trang trai (ga/lon/de-cuu >= 6 hex, bo >= 9 hex). Dat, cap, trang thai va von
-- dau tu nam o world_buildings (building_id); cac o hex nam o building_footprints.
-- ============================================================
CREATE TABLE IF NOT EXISTS `livestock_farms` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `building_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `farm_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `feed_stock` float NOT NULL DEFAULT '0',
  `feed_quality` float NOT NULL DEFAULT '0',
  `water_stock` float NOT NULL DEFAULT '0',
  `water_source` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'well',
  `caretakers` int NOT NULL DEFAULT '0',
  `last_simulated_at` datetime NOT NULL,
  `total_produced` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_livestock_farms_building` (`building_id`),
  KEY `idx_livestock_farms_city` (`city_id`),
  CONSTRAINT `livestock_farms_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `livestock_farms_ibfk_2` FOREIGN KEY (`building_id`) REFERENCES `world_buildings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 22: livestock_farm_tiles
-- Phase 5 – vai tro tung o hex (barn, yard, feeder, water, caretaker, storage, nursery, waste).
-- Chong chong lan do building_footprints UNIQUE(city_id, q, r) dam bao.
-- ============================================================
CREATE TABLE IF NOT EXISTS `livestock_farm_tiles` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `farm_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `q` int NOT NULL,
  `r` int NOT NULL,
  `role` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'yard',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_livestock_farm_tiles_farm_hex` (`farm_id`,`q`,`r`),
  KEY `idx_livestock_farm_tiles_city` (`city_id`),
  CONSTRAINT `livestock_farm_tiles_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `livestock_farm_tiles_ibfk_2` FOREIGN KEY (`farm_id`) REFERENCES `livestock_farms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 23: farm_animals
-- Phase 5 – tung con vat: loai, giong, tuoi, suc khoe, muc no, muc khat, trang thai, trai
-- (khong luu vi tri – frontend tu mo phong di chuyen)
-- ============================================================
CREATE TABLE IF NOT EXISTS `farm_animals` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `farm_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `species_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `breed` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `born_at` datetime NOT NULL,
  `grows_up_at` datetime NOT NULL,
  `health` float NOT NULL DEFAULT '1',
  `satiety` float NOT NULL DEFAULT '1',
  `thirst` float NOT NULL DEFAULT '0',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'young',
  `tameness` float NOT NULL DEFAULT '0',
  `stamina` float NOT NULL DEFAULT '0',
  `speed_bonus` float NOT NULL DEFAULT '0',
  `carry_bonus` float NOT NULL DEFAULT '0',
  `training_level` int NOT NULL DEFAULT '0',
  `starving_seconds` float NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `species_code` (`species_code`),
  KEY `idx_farm_animals_farm` (`farm_id`),
  KEY `idx_farm_animals_city` (`city_id`),
  CONSTRAINT `farm_animals_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `farm_animals_ibfk_2` FOREIGN KEY (`farm_id`) REFERENCES `livestock_farms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `farm_animals_ibfk_3` FOREIGN KEY (`species_code`) REFERENCES `animal_species` (`code`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 24: livestock_production_jobs
-- Phase 5 – dot san xuat (in_progress -> ready -> collected) va dot sinh san
-- ============================================================
CREATE TABLE IF NOT EXISTS `livestock_production_jobs` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `farm_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `job_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `species_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `breed` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `started_at` datetime NOT NULL,
  `finishes_at` datetime NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'in_progress',
  `progress` json NOT NULL,
  `output` json NOT NULL,
  `efficiency` float NOT NULL DEFAULT '0',
  `productive_seconds` float NOT NULL DEFAULT '0',
  `animal_seconds` float NOT NULL DEFAULT '0',
  `completed_at` datetime DEFAULT NULL,
  `collected_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_livestock_jobs_farm_status` (`farm_id`,`status`),
  KEY `idx_livestock_jobs_city` (`city_id`),
  CONSTRAINT `livestock_production_jobs_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `livestock_production_jobs_ibfk_2` FOREIGN KEY (`farm_id`) REFERENCES `livestock_farms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 25: fish_species
-- Phase 6 – loai ca: gia ca giong, can nang, toc do lon, thuc an, chat luong nuoc toi thieu
-- ============================================================
CREATE TABLE IF NOT EXISTS `fish_species` (
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `fry_price` int NOT NULL,
  `fry_weight` float NOT NULL DEFAULT '0',
  `market_weight` float NOT NULL DEFAULT '0',
  `fingerling_weight` float NOT NULL DEFAULT '0',
  `grow_seconds` int NOT NULL,
  `feed_rate` float NOT NULL DEFAULT '0',
  `min_quality` float NOT NULL DEFAULT '0',
  `colors` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 26: water_bodies
-- Phase 6 – ao / ho / khu uom / khu ca long. Dat, cap va von nam o world_buildings (building_id),
-- cac o hex nam o building_footprints. Luu mat nuoc, day ao, dien tich, the tich, muc nuoc,
-- chat luong nuoc, may cho an va dong ho mo phong.
-- ============================================================
CREATE TABLE IF NOT EXISTS `water_bodies` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `building_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `surface_height` float NOT NULL DEFAULT '0',
  `bottom_height` float NOT NULL DEFAULT '0',
  `area` float NOT NULL DEFAULT '0',
  `volume` float NOT NULL DEFAULT '0',
  `shoreline` float NOT NULL DEFAULT '0',
  `water_level` float NOT NULL DEFAULT '0',
  `water_quality` float NOT NULL DEFAULT '0.7',
  `feed_stock` float NOT NULL DEFAULT '0',
  `feed_quality` float NOT NULL DEFAULT '0',
  `fill_started_at` datetime DEFAULT NULL,
  `fill_finishes_at` datetime DEFAULT NULL,
  `ready_at` datetime DEFAULT NULL,
  `last_simulated_at` datetime NOT NULL,
  `total_harvested` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_water_bodies_building` (`building_id`),
  KEY `idx_water_bodies_city` (`city_id`),
  CONSTRAINT `water_bodies_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `water_bodies_ibfk_2` FOREIGN KEY (`building_id`) REFERENCES `world_buildings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 27: water_body_tiles
-- Phase 6 – tung o hex cua ao: do cao goc (world seed) va do cao sau khi dao
-- ============================================================
CREATE TABLE IF NOT EXISTS `water_body_tiles` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `water_body_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `q` int NOT NULL,
  `r` int NOT NULL,
  `original_height` float NOT NULL DEFAULT '0',
  `bed_height` float NOT NULL DEFAULT '0',
  `shore` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_water_body_tiles_body_hex` (`water_body_id`,`q`,`r`),
  KEY `idx_water_body_tiles_city` (`city_id`),
  CONSTRAINT `water_body_tiles_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `water_body_tiles_ibfk_2` FOREIGN KEY (`water_body_id`) REFERENCES `water_bodies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 28: aquaculture_cycles
-- Phase 6 – vu nuoi: tha giong -> sinh truong -> thu hoach
-- ============================================================
CREATE TABLE IF NOT EXISTS `aquaculture_cycles` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `water_body_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `started_at` datetime NOT NULL,
  `harvested_at` datetime DEFAULT NULL,
  `stocked_fish` int NOT NULL DEFAULT '0',
  `feed_used` float NOT NULL DEFAULT '0',
  `harvested` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_aqua_cycles_body_status` (`water_body_id`,`status`),
  KEY `city_id` (`city_id`),
  CONSTRAINT `aquaculture_cycles_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `aquaculture_cycles_ibfk_2` FOREIGN KEY (`water_body_id`) REFERENCES `water_bodies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 29: fish_stock_batches
-- Phase 6 – dot ca tha: loai, nguon giong, so con, can nang, suc khoe
-- ============================================================
CREATE TABLE IF NOT EXISTS `fish_stock_batches` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `water_body_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cycle_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `species_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'market',
  `stocked` int NOT NULL,
  `alive` float NOT NULL DEFAULT '0',
  `weight` float NOT NULL DEFAULT '0',
  `health` float NOT NULL DEFAULT '1',
  `satiety` float NOT NULL DEFAULT '0.8',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'growing',
  `stocked_at` datetime NOT NULL,
  `harvested_at` datetime DEFAULT NULL,
  `harvest_yield` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fish_batches_body_status` (`water_body_id`,`status`),
  KEY `idx_fish_batches_city` (`city_id`),
  KEY `cycle_id` (`cycle_id`),
  KEY `species_code` (`species_code`),
  CONSTRAINT `fish_stock_batches_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fish_stock_batches_ibfk_2` FOREIGN KEY (`water_body_id`) REFERENCES `water_bodies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fish_stock_batches_ibfk_3` FOREIGN KEY (`cycle_id`) REFERENCES `aquaculture_cycles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fish_stock_batches_ibfk_4` FOREIGN KEY (`species_code`) REFERENCES `fish_species` (`code`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 30: water_quality_records
-- Phase 6 – lich su chat luong nuoc, muc nuoc, mat do, thuc an
-- ============================================================
CREATE TABLE IF NOT EXISTS `water_quality_records` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `water_body_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `recorded_at` datetime NOT NULL,
  `quality` float NOT NULL DEFAULT '0',
  `water_level` float NOT NULL DEFAULT '0',
  `density` float NOT NULL DEFAULT '0',
  `feed_stock` float NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_water_quality_body_time` (`water_body_id`,`recorded_at`),
  KEY `city_id` (`city_id`),
  CONSTRAINT `water_quality_records_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `water_quality_records_ibfk_2` FOREIGN KEY (`water_body_id`) REFERENCES `water_bodies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 31: professions
-- Phase 7 – nghe nghiep: trang phuc chibi, animation lam viec (seed tu @cityverse/shared)
-- ============================================================
CREATE TABLE IF NOT EXISTS `professions` (
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `outfit` json NOT NULL,
  `work_clips` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 32: production_recipes
-- Phase 7 – cong thuc san xuat theo loai cong trinh
-- ============================================================
CREATE TABLE IF NOT EXISTS `production_recipes` (
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `building_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `min_level` int NOT NULL DEFAULT '1',
  `inputs` json NOT NULL,
  `outputs` json NOT NULL,
  `seconds` int NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 33: survivors
-- Phase 7 – cu dan: ten, nghe, ky nang, suc khoe, the luc, hai long, ngoai hinh
-- ============================================================
CREATE TABLE IF NOT EXISTS `survivors` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `profession_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `skills` json NOT NULL,
  `health` float NOT NULL DEFAULT '1',
  `stamina` float NOT NULL DEFAULT '1',
  `satisfaction` float NOT NULL DEFAULT '0.6',
  `appearance` json NOT NULL,
  `origin` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'founder',
  `seed` int NOT NULL,
  `assignable` tinyint(1) NOT NULL DEFAULT '1',
  `arrived_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_survivors_city` (`city_id`),
  KEY `profession_code` (`profession_code`),
  CONSTRAINT `survivors_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `survivors_ibfk_2` FOREIGN KEY (`profession_code`) REFERENCES `professions` (`code`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 34: survivor_housing
-- Phase 7 – noi o chinh: UNIQUE(survivor_id) = moi cu dan dung mot nha
-- ============================================================
CREATE TABLE IF NOT EXISTS `survivor_housing` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `survivor_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `building_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `moved_in_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_survivor_housing_survivor` (`survivor_id`),
  KEY `idx_survivor_housing_building` (`building_id`),
  KEY `city_id` (`city_id`),
  CONSTRAINT `survivor_housing_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `survivor_housing_ibfk_2` FOREIGN KEY (`survivor_id`) REFERENCES `survivors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `survivor_housing_ibfk_3` FOREIGN KEY (`building_id`) REFERENCES `world_buildings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 35: survivor_jobs
-- Phase 7 – cong viec toan thoi gian: UNIQUE(survivor_id) = khong lam hai viec cung luc
-- ============================================================
CREATE TABLE IF NOT EXISTS `survivor_jobs` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `survivor_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workplace_kind` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `workplace_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `profession_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `manual` tinyint(1) NOT NULL DEFAULT '0',
  `assigned_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_survivor_jobs_survivor` (`survivor_id`),
  KEY `idx_survivor_jobs_workplace` (`workplace_kind`,`workplace_id`),
  KEY `city_id` (`city_id`),
  KEY `profession_code` (`profession_code`),
  CONSTRAINT `survivor_jobs_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `survivor_jobs_ibfk_2` FOREIGN KEY (`survivor_id`) REFERENCES `survivors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `survivor_jobs_ibfk_3` FOREIGN KEY (`profession_code`) REFERENCES `professions` (`code`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 36: production_jobs
-- Phase 7 – cong thuc dang chay, tien do va kho dem san pham cua tung xuong
-- ============================================================
CREATE TABLE IF NOT EXISTS `production_jobs` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `building_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `recipe_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `progress` float NOT NULL DEFAULT '0',
  `buffer` json NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'idle',
  `batches_total` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_production_jobs_building` (`building_id`),
  KEY `city_id` (`city_id`),
  KEY `recipe_code` (`recipe_code`),
  CONSTRAINT `production_jobs_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `production_jobs_ibfk_2` FOREIGN KEY (`building_id`) REFERENCES `world_buildings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `production_jobs_ibfk_3` FOREIGN KEY (`recipe_code`) REFERENCES `production_recipes` (`code`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 37: resource_transactions
-- Phase 7 – so thu chi tai nguyen (gop theo lan tinh, ly do, tai nguyen)
-- ============================================================
CREATE TABLE IF NOT EXISTS `resource_transactions` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `delta` float NOT NULL,
  `reason` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ref_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `period_start` datetime NOT NULL,
  `period_end` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_resource_tx_city_time` (`city_id`,`period_end`),
  CONSTRAINT `resource_transactions_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 38: world_time_states
-- Phase 7 – dong ho game moi thanh pho (moc thoi gian, do dai ngay) va cai dat dan cu
-- ============================================================
CREATE TABLE IF NOT EXISTS `world_time_states` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `epoch` datetime NOT NULL,
  `day_seconds` int NOT NULL,
  `last_settled_at` datetime NOT NULL,
  `auto_assign` tinyint(1) NOT NULL DEFAULT '1',
  `natural_growth` tinyint(1) NOT NULL DEFAULT '0',
  `rescue` json DEFAULT NULL,
  `initialized` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_world_time_states_city` (`city_id`),
  CONSTRAINT `world_time_states_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 39: unit_types
-- Phase 8 – bon binh chung: dao, thuong, cung, no (chi so, trang bi bat buoc, bai tap)
-- ============================================================
CREATE TABLE IF NOT EXISTS `unit_types` (
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `building_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `base` json NOT NULL,
  `train_seconds` int NOT NULL,
  `food` int NOT NULL,
  `coins` int NOT NULL,
  `required` json NOT NULL,
  `drills` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 40: equipment_types
-- Phase 8 – vu khi / giap / dan (ton kho nam trong city_resources voi ma eq_*)
-- ============================================================
CREATE TABLE IF NOT EXISTS `equipment_types` (
  `code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slot` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bonus` json NOT NULL,
  `units` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 41: military_units
-- Phase 8 – binh si = cu dan that: UNIQUE(survivor_id), binh chung, cap bac, xp, trang thai
-- ============================================================
CREATE TABLE IF NOT EXISTS `military_units` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `survivor_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_type_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `building_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rank` int NOT NULL DEFAULT '1',
  `xp` int NOT NULL DEFAULT '0',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'recruit',
  `recruited_at` datetime NOT NULL,
  `trained_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_military_units_survivor` (`survivor_id`),
  KEY `idx_military_units_city` (`city_id`),
  KEY `building_id` (`building_id`),
  CONSTRAINT `military_units_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `military_units_ibfk_2` FOREIGN KEY (`survivor_id`) REFERENCES `survivors` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `military_units_ibfk_3` FOREIGN KEY (`building_id`) REFERENCES `world_buildings` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 42: unit_equipment
-- Phase 8 – trang bi cua tung binh si: UNIQUE(unit_id, slot)
-- ============================================================
CREATE TABLE IF NOT EXISTS `unit_equipment` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slot` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `equipment_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_unit_equipment_slot` (`unit_id`,`slot`),
  CONSTRAINT `unit_equipment_ibfk_1` FOREIGN KEY (`unit_id`) REFERENCES `military_units` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 43: military_training_jobs
-- Phase 8 – huan luyen tan binh / thao luyen theo moc thoi gian server (hoan thanh dung mot lan)
-- ============================================================
CREATE TABLE IF NOT EXISTS `military_training_jobs` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `building_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_type_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit_ids` json NOT NULL,
  `started_at` datetime NOT NULL,
  `finishes_at` datetime NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'in_progress',
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_military_jobs_city_status` (`city_id`,`status`),
  KEY `building_id` (`building_id`),
  CONSTRAINT `military_training_jobs_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `military_training_jobs_ibfk_2` FOREIGN KEY (`building_id`) REFERENCES `world_buildings` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 44: military_squads
-- Phase 8 – doi hinh: ten, doi hinh, trang thai (standby / deployed)
-- ============================================================
CREATE TABLE IF NOT EXISTS `military_squads` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `formation` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'line',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standby',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_military_squads_city` (`city_id`),
  CONSTRAINT `military_squads_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 45: military_squad_members
-- Phase 8 – thanh vien doi: UNIQUE(squad_id, unit_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS `military_squad_members` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `squad_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_squad_members_squad_unit` (`squad_id`,`unit_id`),
  KEY `idx_squad_members_unit` (`unit_id`),
  CONSTRAINT `military_squad_members_ibfk_1` FOREIGN KEY (`squad_id`) REFERENCES `military_squads` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `military_squad_members_ibfk_2` FOREIGN KEY (`unit_id`) REFERENCES `military_units` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 46: animal_training_jobs
-- Phase 9 – chuong trinh huan luyen ngua / voi theo moc thoi gian server (hoan thanh dung mot lan)
-- ============================================================
CREATE TABLE IF NOT EXISTS `animal_training_jobs` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `farm_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `animal_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `program` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime NOT NULL,
  `finishes_at` datetime NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'in_progress',
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_animal_training_city_status` (`city_id`,`status`),
  KEY `idx_animal_training_animal` (`animal_id`),
  KEY `farm_id` (`farm_id`),
  CONSTRAINT `animal_training_jobs_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `animal_training_jobs_ibfk_2` FOREIGN KEY (`farm_id`) REFERENCES `livestock_farms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `animal_training_jobs_ibfk_3` FOREIGN KEY (`animal_id`) REFERENCES `farm_animals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ============================================================
-- BANG 47: animal_assignments
-- Phase 9 – nhiem vu cua thu: cho vat lieu / du bi quan su (UNIQUE animal_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS `animal_assignments` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `animal_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assigned_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_animal_assignments_animal` (`animal_id`),
  KEY `idx_animal_assignments_city` (`city_id`),
  CONSTRAINT `animal_assignments_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `animal_assignments_ibfk_2` FOREIGN KEY (`animal_id`) REFERENCES `farm_animals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ============================================================
-- BANG 48: animal_equipment
-- Phase 9 – yen / giap ngua / dai cho hang / banh voi (UNIQUE animal_id + slot)
-- ============================================================
CREATE TABLE IF NOT EXISTS `animal_equipment` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `animal_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slot` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `equipment_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_animal_equipment_slot` (`animal_id`,`slot`),
  CONSTRAINT `animal_equipment_ibfk_1` FOREIGN KEY (`animal_id`) REFERENCES `farm_animals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ============================================================
-- BANG 49: mount_assignments
-- Phase 9 – ngua <-> binh si: UNIQUE animal_id va UNIQUE unit_id
-- ============================================================
CREATE TABLE IF NOT EXISTS `mount_assignments` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `animal_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assigned_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mount_assignments_animal` (`animal_id`),
  UNIQUE KEY `uq_mount_assignments_unit` (`unit_id`),
  KEY `idx_mount_assignments_city` (`city_id`),
  CONSTRAINT `mount_assignments_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `mount_assignments_ibfk_2` FOREIGN KEY (`animal_id`) REFERENCES `farm_animals` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `mount_assignments_ibfk_3` FOREIGN KEY (`unit_id`) REFERENCES `military_units` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- ============================================================
-- BANG 50: animal_care_records
-- Phase 9 – nhat ky cham soc: cho an, uong, chai long, thu y, huan luyen, chet …
-- ============================================================
CREATE TABLE IF NOT EXISTS `animal_care_records` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `farm_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `animal_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kind` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_animal_care_city_time` (`city_id`,`at`),
  KEY `idx_animal_care_animal` (`animal_id`),
  KEY `farm_id` (`farm_id`),
  CONSTRAINT `animal_care_records_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `animal_care_records_ibfk_2` FOREIGN KEY (`farm_id`) REFERENCES `livestock_farms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 51: world_scan_jobs
-- Phase 10 – quet radar vung dat moi (theo moc thoi gian server)
-- ============================================================
CREATE TABLE IF NOT EXISTS `world_scan_jobs` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `idempotency_key` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fingerprint` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `hexes` json NOT NULL,
  `finishes_at` datetime NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `world_scan_jobs_city_id_idempotency_key` (`city_id`,`idempotency_key`),
  KEY `world_scan_jobs_city_id_status_finishes_at` (`city_id`,`status`,`finishes_at`),
  CONSTRAINT `world_scan_jobs_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 52: world_claim_jobs
-- Phase 10 – khai pha / chiem dat da quet
-- ============================================================
CREATE TABLE IF NOT EXISTS `world_claim_jobs` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `idempotency_key` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fingerprint` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `hexes` json NOT NULL,
  `finishes_at` datetime NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `world_claim_jobs_city_id_idempotency_key` (`city_id`,`idempotency_key`),
  KEY `world_claim_jobs_city_id_status_finishes_at` (`city_id`,`status`,`finishes_at`),
  CONSTRAINT `world_claim_jobs_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 53: world_discoveries
-- Phase 10 – trang thai tung o ngoai lanh tho (an / da quet / bi chan …)
-- ============================================================
CREATE TABLE IF NOT EXISTS `world_discoveries` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `q` int NOT NULL,
  `r` int NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `world_discoveries_city_id_q_r` (`city_id`,`q`,`r`),
  CONSTRAINT `world_discoveries_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 54: world_points_of_interest
-- Phase 10 – diem dac biet (can cu dich, phe tich, khu nhiem doc …)
-- ============================================================
CREATE TABLE IF NOT EXISTS `world_points_of_interest` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `q` int NOT NULL,
  `r` int NOT NULL,
  `kind` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `world_points_of_interest_city_id_q_r` (`city_id`,`q`,`r`),
  CONSTRAINT `world_points_of_interest_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 55: battle_instances
-- Phase 11 – tran PvE: nhiem vu, giai doan, trang thai engine (JSON), version, han bo do
-- ============================================================
CREATE TABLE IF NOT EXISTS `battle_instances` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mission_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `poi_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version` int NOT NULL DEFAULT '0',
  `seed` int NOT NULL,
  `state` json NOT NULL,
  `request_key` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fingerprint` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_action_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `outcome` json DEFAULT NULL,
  `settled` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_battle_instances_request` (`city_id`,`request_key`),
  KEY `idx_battle_instances_city_status` (`city_id`,`status`),
  KEY `idx_battle_instances_mission_status` (`mission_code`,`status`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `battle_instances_ibfk_1` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `battle_instances_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 56: battle_participants
-- Phase 11 – nguoi tham chien va phe
-- ============================================================
CREATE TABLE IF NOT EXISTS `battle_participants` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `battle_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `side` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `joined_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_battle_participants` (`battle_id`,`user_id`),
  KEY `idx_battle_participants_user` (`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `battle_participants_ibfk_1` FOREIGN KEY (`battle_id`) REFERENCES `battle_instances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `battle_participants_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 57: battle_units
-- Phase 11 – binh si / ke dich trong tran: HP dau / cuoi, gục, ha dich, XP, thuong tich
-- ============================================================
CREATE TABLE IF NOT EXISTS `battle_units` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `battle_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_key` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `military_unit_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `side` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_hp` int NOT NULL,
  `max_hp` int NOT NULL,
  `end_hp` int DEFAULT NULL,
  `ko` tinyint(1) NOT NULL DEFAULT '0',
  `kills` int NOT NULL DEFAULT '0',
  `xp_gained` int NOT NULL DEFAULT '0',
  `injury` float NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_battle_units_key` (`battle_id`,`unit_key`),
  CONSTRAINT `battle_units_ibfk_1` FOREIGN KEY (`battle_id`) REFERENCES `battle_instances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 58: battle_actions
-- Phase 11 – moi hanh dong da chap nhan: UNIQUE client_action_id (gui lai khong ap dung 2 lan), UNIQUE seq
-- ============================================================
CREATE TABLE IF NOT EXISTS `battle_actions` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `battle_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `seq` int NOT NULL,
  `turn` int NOT NULL,
  `client_action_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fingerprint` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` json NOT NULL,
  `events` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_battle_actions_client` (`battle_id`,`client_action_id`),
  UNIQUE KEY `uq_battle_actions_seq` (`battle_id`,`seq`),
  CONSTRAINT `battle_actions_ibfk_1` FOREIGN KEY (`battle_id`) REFERENCES `battle_instances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 59: battle_turns
-- Phase 11 – nhat ky luot (luot, phe, bat dau / ket thuc)
-- ============================================================
CREATE TABLE IF NOT EXISTS `battle_turns` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `battle_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `turn` int NOT NULL,
  `side` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `started_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_battle_turns` (`battle_id`,`turn`,`side`),
  CONSTRAINT `battle_turns_ibfk_1` FOREIGN KEY (`battle_id`) REFERENCES `battle_instances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 60: battle_rewards
-- Phase 11 – phan thuong do server tinh: UNIQUE battle_id, nhan dung mot lan (claimed_at)
-- ============================================================
CREATE TABLE IF NOT EXISTS `battle_rewards` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `battle_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rewards` json NOT NULL,
  `stars` int NOT NULL DEFAULT '0',
  `claimed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_battle_rewards_battle` (`battle_id`),
  KEY `city_id` (`city_id`),
  CONSTRAINT `battle_rewards_ibfk_1` FOREIGN KEY (`battle_id`) REFERENCES `battle_instances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `battle_rewards_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 61: friend_requests
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `friend_requests` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `to_user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `responded_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_friend_requests_to` (`to_user_id`,`status`),
  KEY `idx_friend_requests_from` (`from_user_id`,`status`,`created_at`),
  CONSTRAINT `friend_requests_ibfk_1` FOREIGN KEY (`from_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `friend_requests_ibfk_2` FOREIGN KEY (`to_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 62: friendships
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `friendships` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_a_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_b_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_friendships_pair` (`user_a_id`,`user_b_id`),
  KEY `idx_friendships_b` (`user_b_id`),
  CONSTRAINT `friendships_ibfk_1` FOREIGN KEY (`user_a_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `friendships_ibfk_2` FOREIGN KEY (`user_b_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 63: notifications
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actor_user_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `kind` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` json NOT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user` (`user_id`,`created_at`),
  KEY `idx_notifications_actor` (`actor_user_id`,`kind`,`created_at`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `notifications_ibfk_2` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 64: pvp_seasons
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `pvp_seasons` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `number` int NOT NULL,
  `name` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `starts_at` datetime NOT NULL,
  `ends_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pvp_seasons_number` (`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 65: pvp_ratings
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `pvp_ratings` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `season_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rating` int NOT NULL,
  `wins` int NOT NULL DEFAULT '0',
  `losses` int NOT NULL DEFAULT '0',
  `draws` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pvp_ratings_season_user` (`season_id`,`user_id`),
  KEY `idx_pvp_ratings_leaderboard` (`season_id`,`rating`),
  CONSTRAINT `pvp_ratings_ibfk_1` FOREIGN KEY (`season_id`) REFERENCES `pvp_seasons` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pvp_ratings_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 66: pvp_queue
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `pvp_queue` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `unit_ids` json NOT NULL,
  `rating` int NOT NULL,
  `games` int NOT NULL,
  `power` int NOT NULL,
  `enqueued_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pvp_queue_user` (`user_id`),
  CONSTRAINT `pvp_queue_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pvp_queue_ibfk_2` FOREIGN KEY (`city_id`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 67: pvp_rooms
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `pvp_rooms` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `host_user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `guest_user_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invited_user_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ranked` tinyint(1) NOT NULL DEFAULT '0',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `host_unit_ids` json NOT NULL,
  `guest_unit_ids` json NOT NULL,
  `battle_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pvp_rooms_host` (`host_user_id`,`status`),
  KEY `idx_pvp_rooms_guest` (`guest_user_id`,`status`),
  KEY `idx_pvp_rooms_invited` (`invited_user_id`,`status`),
  CONSTRAINT `pvp_rooms_ibfk_1` FOREIGN KEY (`host_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pvp_rooms_ibfk_2` FOREIGN KEY (`guest_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pvp_rooms_ibfk_3` FOREIGN KEY (`invited_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `pvp_rooms_ibfk_4` FOREIGN KEY (`battle_id`) REFERENCES `battle_instances` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 68: pvp_matches
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `pvp_matches` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `battle_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `season_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `host_user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `guest_user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `winner_user_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `host_rating_before` int NOT NULL,
  `host_rating_after` int NOT NULL,
  `guest_rating_before` int NOT NULL,
  `guest_rating_after` int NOT NULL,
  `reason` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ended_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pvp_matches_battle` (`battle_id`),
  KEY `idx_pvp_matches_host` (`host_user_id`,`ended_at`),
  KEY `idx_pvp_matches_guest` (`guest_user_id`,`ended_at`),
  CONSTRAINT `pvp_matches_ibfk_1` FOREIGN KEY (`battle_id`) REFERENCES `battle_instances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pvp_matches_ibfk_2` FOREIGN KEY (`season_id`) REFERENCES `pvp_seasons` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pvp_matches_ibfk_3` FOREIGN KEY (`host_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pvp_matches_ibfk_4` FOREIGN KEY (`guest_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `pvp_matches_ibfk_5` FOREIGN KEY (`winner_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 69: alliances
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `alliances` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tag` varchar(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `leader_user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_alliances_name` (`name`),
  UNIQUE KEY `uq_alliances_tag` (`tag`),
  CONSTRAINT `alliances_ibfk_1` FOREIGN KEY (`leader_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 70: alliance_roles
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `alliance_roles` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alliance_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rank` int NOT NULL,
  `permissions` json NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_alliance_roles_code` (`alliance_id`,`code`),
  CONSTRAINT `alliance_roles_ibfk_1` FOREIGN KEY (`alliance_id`) REFERENCES `alliances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 71: alliance_members
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `alliance_members` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alliance_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_code` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contribution` int NOT NULL DEFAULT '0',
  `joined_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_alliance_members_user` (`user_id`),
  KEY `idx_alliance_members_alliance` (`alliance_id`),
  CONSTRAINT `alliance_members_ibfk_1` FOREIGN KEY (`alliance_id`) REFERENCES `alliances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `alliance_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 72: alliance_messages
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `alliance_messages` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alliance_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_alliance_messages_feed` (`alliance_id`,`created_at`),
  KEY `idx_alliance_messages_user` (`user_id`,`created_at`),
  CONSTRAINT `alliance_messages_ibfk_1` FOREIGN KEY (`alliance_id`) REFERENCES `alliances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `alliance_messages_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 73: alliance_invites
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `alliance_invites` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alliance_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invited_by_user_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_alliance_invites_user` (`user_id`,`status`),
  CONSTRAINT `alliance_invites_ibfk_1` FOREIGN KEY (`alliance_id`) REFERENCES `alliances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `alliance_invites_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `alliance_invites_ibfk_3` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- BANG 74: alliance_quests
-- Phase 12
-- ============================================================
CREATE TABLE IF NOT EXISTS `alliance_quests` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alliance_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target` int NOT NULL,
  `progress` int NOT NULL DEFAULT '0',
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `ends_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_alliance_quests_alliance` (`alliance_id`,`status`),
  CONSTRAINT `alliance_quests_ibfk_1` FOREIGN KEY (`alliance_id`) REFERENCES `alliances` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Lich su migration: danh dau cac migration da duoc ap dung boi script nay,
-- de "npm run db:migrate" chi chay cac migration moi hon.
-- ============================================================
CREATE TABLE IF NOT EXISTS `SequelizeMeta` (
  `name` VARCHAR(255) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
INSERT IGNORE INTO `SequelizeMeta` (`name`) VALUES
  ('20261119000100-create-users.cjs'),
  ('20261119000200-create-refresh-tokens.cjs'),
  ('20261119000300-create-characters.cjs'),
  ('20261119000400-create-cities.cjs'),
  ('20261119000500-create-city-members.cjs'),
  ('20261119000600-create-city-economies.cjs'),
  ('20261119000700-create-city-chunks.cjs'),
  ('20261121000100-create-building-system.cjs'),
  ('20261121000200-create-agriculture.cjs'),
  ('20261121000300-create-livestock.cjs'),
  ('20261122000100-create-aquaculture.cjs'),
  ('20261123000100-create-population.cjs'),
  ('20261124000100-create-military.cjs'),
  ('20261125000100-create-mounts.cjs'),
  ('20261126000100-create-exploration.cjs'),
  ('20261127000100-create-battles.cjs'),
  ('20261128000100-create-social.cjs');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- Kiem tra: liet ke cac bang vua tao
-- ============================================================
SELECT
  TABLE_NAME      AS `Bang`,
  ENGINE          AS `Engine`,
  TABLE_COLLATION AS `Collation`,
  CREATE_TIME     AS `Tao luc`
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'cityverse'
ORDER BY CREATE_TIME, TABLE_NAME;

-- ============================================================
-- Hoan tat! Tat ca 74 bang (+ SequelizeMeta) da san sang.
-- ============================================================
