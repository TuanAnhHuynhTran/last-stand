-- ============================================================
-- CITYVERSE - Phase 5 livestock schema v1 -> v2 (MySQL 8)
-- ============================================================
-- Dung cho database da tao bang livestock phien ban cu (animal_types, livestock_farm_tiles
-- giu dat rieng). Script XOA du lieu chan nuoi cu va tao lai 6 bang moi; cac bang khac
-- (users, cities, buildings, farms...) khong bi dong toi.
--
--   mysql -u root -p cityverse < server/scripts/upgrade-livestock-v2.sql
-- ============================================================

USE `cityverse`;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `livestock_production_jobs`;
DROP TABLE IF EXISTS `farm_animals`;
DROP TABLE IF EXISTS `livestock_farm_tiles`;
DROP TABLE IF EXISTS `livestock_farms`;
DROP TABLE IF EXISTS `animal_feed_recipes`;
DROP TABLE IF EXISTS `animal_species`;
DROP TABLE IF EXISTS `animal_types`;

-- ============================================================
-- BANG 19: animal_species
-- Phase 5 – loai vat nuoi: sinh truong, tuoi tho, an uong, san pham, giong (seed tu @cityverse/shared)
-- ============================================================
CREATE TABLE `animal_species` (
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
CREATE TABLE `animal_feed_recipes` (
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
CREATE TABLE `livestock_farms` (
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
CREATE TABLE `livestock_farm_tiles` (
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
CREATE TABLE `farm_animals` (
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
CREATE TABLE `livestock_production_jobs` (
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

SET FOREIGN_KEY_CHECKS = 1;
