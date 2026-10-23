-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Oct 22, 2026 at 04:39 PM
-- Server version: 10.5.25-MariaDB-cll-lve
-- PHP Version: 8.1.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `johnhash_phorid_taxonomy`
--

-- --------------------------------------------------------

--
-- Table structure for table `characters`
--

CREATE TABLE `characters` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `anatomical_region` varchar(128) DEFAULT NULL,
  `data_type` enum('categorical','numeric_range') NOT NULL DEFAULT 'categorical',
  `unit` varchar(64) DEFAULT NULL,
  `created_by_uid` varchar(128) DEFAULT NULL,
  `visibility` enum('private','shared','public') NOT NULL DEFAULT 'private',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `characters`
--

INSERT INTO `characters` (`id`, `name`, `description`, `anatomical_region`, `data_type`, `unit`, `created_by_uid`, `visibility`, `created_at`, `updated_at`) VALUES
(1, 'Anepisternal setae', 'Setation of the anepisternum.', 'Thorax', 'categorical', NULL, NULL, 'private', '2026-09-25 01:23:44', '2026-09-25 01:23:44'),
(2, 'Body length', 'Total body length.', 'General', 'numeric_range', 'mm', NULL, 'private', '2026-09-25 01:24:00', '2026-09-25 01:24:00'),
(3, 'TEST Anepisternal setae', 'Temporary categorical character for testing.', 'Thorax', 'categorical', NULL, NULL, 'private', '2026-10-05 23:49:41', '2026-10-05 23:49:41'),
(4, 'TEST Frons color', 'Temporary categorical character for testing.', 'Head', 'categorical', NULL, NULL, 'private', '2026-10-05 23:49:41', '2026-10-05 23:49:41'),
(5, 'TEST Body length', 'Temporary numeric-range character for testing.', 'General', 'numeric_range', 'mm', NULL, 'private', '2026-10-05 23:49:41', '2026-10-05 23:49:41');

-- --------------------------------------------------------

--
-- Table structure for table `character_observations`
--

CREATE TABLE `character_observations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `description_id` bigint(20) UNSIGNED NOT NULL,
  `character_id` bigint(20) UNSIGNED NOT NULL,
  `numeric_min` decimal(12,6) DEFAULT NULL,
  `numeric_max` decimal(12,6) DEFAULT NULL,
  `evidence_basis` enum('unspecified','specimen','publication','mixed','taxonomic_judgment') NOT NULL DEFAULT 'unspecified',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `character_observations`
--

INSERT INTO `character_observations` (`id`, `description_id`, `character_id`, `numeric_min`, `numeric_max`, `evidence_basis`, `notes`, `created_at`, `updated_at`) VALUES
(1, 1, 2, 1.540000, 1.930000, 'unspecified', NULL, '2026-09-25 23:12:29', '2026-09-25 23:12:29'),
(2, 1, 1, NULL, NULL, 'unspecified', NULL, '2026-09-25 23:13:21', '2026-09-25 23:13:21'),
(3, 4, 3, NULL, NULL, 'unspecified', NULL, '2026-10-06 00:02:32', '2026-10-06 00:02:32'),
(4, 4, 4, NULL, NULL, 'unspecified', NULL, '2026-10-06 00:02:32', '2026-10-06 00:02:32'),
(5, 5, 3, NULL, NULL, 'unspecified', NULL, '2026-10-06 00:02:32', '2026-10-06 00:02:32'),
(6, 5, 4, NULL, NULL, 'unspecified', NULL, '2026-10-06 00:02:32', '2026-10-06 00:02:32'),
(7, 6, 3, NULL, NULL, 'unspecified', NULL, '2026-10-06 00:02:32', '2026-10-06 00:02:32'),
(8, 6, 4, NULL, NULL, 'unspecified', NULL, '2026-10-06 00:02:32', '2026-10-06 00:02:32'),
(9, 4, 5, 1.500000, 1.800000, 'unspecified', NULL, '2026-10-06 00:03:06', '2026-10-06 00:03:06'),
(10, 5, 5, 1.700000, 2.000000, 'unspecified', NULL, '2026-10-06 00:03:06', '2026-10-06 00:03:06'),
(11, 6, 5, 1.600000, 1.900000, 'unspecified', NULL, '2026-10-06 00:03:06', '2026-10-06 00:03:06');

-- --------------------------------------------------------

--
-- Table structure for table `character_observation_publications`
--

CREATE TABLE `character_observation_publications` (
  `character_observation_id` bigint(20) UNSIGNED NOT NULL,
  `publication_id` bigint(20) UNSIGNED NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `character_observation_specimen_evidence`
--

CREATE TABLE `character_observation_specimen_evidence` (
  `character_observation_id` bigint(20) UNSIGNED NOT NULL,
  `description_id` bigint(20) UNSIGNED NOT NULL,
  `specimen_reference_id` bigint(20) UNSIGNED NOT NULL,
  `specimen_observation_id` bigint(20) UNSIGNED NOT NULL,
  `character_id` bigint(20) UNSIGNED NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `character_states`
--

CREATE TABLE `character_states` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `character_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `display_order` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `character_states`
--

INSERT INTO `character_states` (`id`, `character_id`, `name`, `description`, `display_order`, `created_at`, `updated_at`) VALUES
(1, 1, 'bare', NULL, 10, '2026-09-25 22:10:52', '2026-09-25 22:10:52'),
(2, 1, 'small setulae', NULL, 20, '2026-09-25 22:10:52', '2026-09-25 22:10:52'),
(3, 1, 'one large seta and small setulae', NULL, 30, '2026-09-25 22:10:52', '2026-09-25 22:10:52'),
(4, 1, 'two large setae and small setulae', NULL, 40, '2026-09-25 22:10:52', '2026-09-25 22:10:52'),
(9, 3, 'bare', NULL, 10, '2026-10-05 23:52:55', '2026-10-05 23:52:55'),
(10, 3, 'small setulae', NULL, 20, '2026-10-05 23:52:55', '2026-10-05 23:52:55'),
(11, 4, 'yellow', NULL, 10, '2026-10-05 23:52:55', '2026-10-05 23:52:55'),
(12, 4, 'brown', NULL, 20, '2026-10-05 23:52:55', '2026-10-05 23:52:55');

-- --------------------------------------------------------

--
-- Table structure for table `description_publications`
--

CREATE TABLE `description_publications` (
  `description_id` bigint(20) UNSIGNED NOT NULL,
  `publication_id` bigint(20) UNSIGNED NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `description_publications`
--

INSERT INTO `description_publications` (`description_id`, `publication_id`, `notes`, `created_at`) VALUES
(4, 1, 'Published character data used for this description.', '2026-10-05 23:56:13'),
(6, 1, 'Published information contributing to this mixed description.', '2026-10-05 23:56:37'),
(6, 2, 'Published information contributing to this mixed description.', '2026-10-05 23:56:37');

-- --------------------------------------------------------

--
-- Table structure for table `description_specimens`
--

CREATE TABLE `description_specimens` (
  `description_id` bigint(20) UNSIGNED NOT NULL,
  `specimen_reference_id` bigint(20) UNSIGNED NOT NULL,
  `reported_material_examined` tinyint(1) NOT NULL DEFAULT 0,
  `directly_examined` tinyint(1) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `description_specimens`
--

INSERT INTO `description_specimens` (`description_id`, `specimen_reference_id`, `reported_material_examined`, `directly_examined`, `notes`, `created_at`) VALUES
(1, 1, 0, 0, 'Temporary specimen association for testing.', '2026-10-05 22:24:07');

-- --------------------------------------------------------

--
-- Table structure for table `description_specimen_publications`
--

CREATE TABLE `description_specimen_publications` (
  `description_id` bigint(20) UNSIGNED NOT NULL,
  `specimen_reference_id` bigint(20) UNSIGNED NOT NULL,
  `publication_id` bigint(20) UNSIGNED NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `identification_keys`
--

CREATE TABLE `identification_keys` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `status` enum('draft','published') NOT NULL DEFAULT 'draft',
  `origin` enum('new','published_adaptation','synthesis') NOT NULL DEFAULT 'new',
  `source_publication_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_by_uid` varchar(128) DEFAULT NULL,
  `published_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `identification_keys`
--

INSERT INTO `identification_keys` (`id`, `name`, `description`, `status`, `origin`, `source_publication_id`, `created_by_uid`, `published_at`, `created_at`, `updated_at`) VALUES
(1, 'Key to North American Myriophora', 'Multi-entry identification key drawing on descriptive work from multiple research workspaces.', 'draft', 'synthesis', NULL, NULL, NULL, '2026-10-05 22:46:26', '2026-10-05 22:46:26'),
(2, 'TEST North American Testphora Key', 'Temporary cross-workspace multi-entry key.', 'draft', 'synthesis', NULL, NULL, NULL, '2026-10-06 00:06:29', '2026-10-06 00:06:29');

-- --------------------------------------------------------

--
-- Table structure for table `key_characters`
--

CREATE TABLE `key_characters` (
  `key_id` bigint(20) UNSIGNED NOT NULL,
  `character_id` bigint(20) UNSIGNED NOT NULL,
  `display_order` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `key_characters`
--

INSERT INTO `key_characters` (`key_id`, `character_id`, `display_order`, `notes`, `created_at`) VALUES
(1, 1, 10, NULL, '2026-10-05 23:37:37'),
(1, 2, 20, NULL, '2026-10-05 23:37:37'),
(2, 3, 10, NULL, '2026-10-06 00:08:32'),
(2, 4, 20, NULL, '2026-10-06 00:08:32');

-- --------------------------------------------------------

--
-- Table structure for table `key_descriptions`
--

CREATE TABLE `key_descriptions` (
  `key_id` bigint(20) UNSIGNED NOT NULL,
  `description_id` bigint(20) UNSIGNED NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `key_descriptions`
--

INSERT INTO `key_descriptions` (`key_id`, `description_id`, `notes`, `created_at`) VALUES
(1, 1, 'Female description included for testing.', '2026-10-05 23:32:13'),
(2, 4, NULL, '2026-10-06 00:07:56'),
(2, 5, NULL, '2026-10-06 00:07:56'),
(2, 6, NULL, '2026-10-06 00:07:56');

-- --------------------------------------------------------

--
-- Table structure for table `observation_states`
--

CREATE TABLE `observation_states` (
  `observation_id` bigint(20) UNSIGNED NOT NULL,
  `character_id` bigint(20) UNSIGNED NOT NULL,
  `state_id` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `observation_states`
--

INSERT INTO `observation_states` (`observation_id`, `character_id`, `state_id`, `created_at`) VALUES
(2, 1, 1, '2026-09-27 14:47:00'),
(2, 1, 2, '2026-09-27 14:49:31'),
(3, 3, 9, '2026-10-06 00:04:26'),
(4, 4, 12, '2026-10-06 00:04:26'),
(5, 3, 10, '2026-10-06 00:04:37'),
(6, 4, 11, '2026-10-06 00:04:37'),
(7, 3, 9, '2026-10-06 00:04:52'),
(7, 3, 10, '2026-10-06 00:04:52'),
(8, 4, 12, '2026-10-06 00:04:52');

-- --------------------------------------------------------

--
-- Table structure for table `publications`
--

CREATE TABLE `publications` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `short_label` varchar(255) DEFAULT NULL,
  `citation` text NOT NULL,
  `doi` varchar(255) DEFAULT NULL,
  `url` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `publications`
--

INSERT INTO `publications` (`id`, `short_label`, `citation`, `doi`, `url`, `notes`, `created_at`, `updated_at`) VALUES
(1, 'TEST Brown 1995', 'Brown, B.V. 1995. Temporary publication used only for database testing.', NULL, NULL, NULL, '2026-10-05 23:54:38', '2026-10-05 23:54:38'),
(2, 'TEST Smith 2004', 'Smith, A.B. 2004. Second temporary publication used only for database testing.', NULL, NULL, NULL, '2026-10-05 23:54:38', '2026-10-05 23:54:38');

-- --------------------------------------------------------

--
-- Table structure for table `species`
--

CREATE TABLE `species` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `gbif_taxon_key` bigint(20) UNSIGNED DEFAULT NULL,
  `genus` varchar(128) NOT NULL,
  `specific_epithet` varchar(128) DEFAULT NULL,
  `species_status` enum('published','work_in_progress') NOT NULL DEFAULT 'published',
  `working_name` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `species`
--

INSERT INTO `species` (`id`, `gbif_taxon_key`, `genus`, `specific_epithet`, `species_status`, `working_name`, `notes`, `created_at`, `updated_at`) VALUES
(2, NULL, 'Myriophora', 'testa', 'published', NULL, NULL, '2026-09-25 22:35:52', '2026-09-25 22:35:52'),
(3, NULL, 'Myriophora', 'exempla', 'published', NULL, NULL, '2026-09-25 22:35:52', '2026-09-25 22:35:52'),
(4, NULL, 'Testphora', 'borealis', 'published', NULL, NULL, '2026-10-05 23:49:08', '2026-10-05 23:49:08'),
(5, NULL, 'Testphora', 'occidentalis', 'published', NULL, NULL, '2026-10-05 23:49:08', '2026-10-05 23:49:08'),
(6, NULL, 'Testphora', NULL, 'work_in_progress', 'Prairie 1', NULL, '2026-10-05 23:49:08', '2026-10-05 23:49:08');

-- --------------------------------------------------------

--
-- Table structure for table `species_descriptions`
--

CREATE TABLE `species_descriptions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `workspace_id` bigint(20) UNSIGNED NOT NULL,
  `species_id` bigint(20) UNSIGNED NOT NULL,
  `sex_scope` enum('general','female','male') NOT NULL DEFAULT 'general',
  `basis` enum('publication','new_observations','mixed') DEFAULT NULL,
  `interpretation_label` varchar(255) DEFAULT NULL,
  `interpretation_type` enum('published','new_interpretation','alternative','synthesis') NOT NULL DEFAULT 'new_interpretation',
  `attribution_text` varchar(255) DEFAULT NULL,
  `derived_from_description_id` bigint(20) UNSIGNED DEFAULT NULL,
  `diagnosis` text DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `prepared_by_uid` varchar(128) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `species_descriptions`
--

INSERT INTO `species_descriptions` (`id`, `workspace_id`, `species_id`, `sex_scope`, `basis`, `interpretation_label`, `interpretation_type`, `attribution_text`, `derived_from_description_id`, `diagnosis`, `remarks`, `prepared_by_uid`, `created_at`, `updated_at`) VALUES
(1, 1, 2, 'female', NULL, NULL, 'new_interpretation', NULL, NULL, 'Temporary diagnosis for testing.', 'Temporary description record.', NULL, '2026-09-25 22:49:16', '2026-09-25 22:49:16'),
(2, 1, 2, 'male', NULL, NULL, 'new_interpretation', NULL, NULL, NULL, NULL, NULL, '2026-09-25 22:50:16', '2026-09-25 22:50:16'),
(4, 2, 4, 'female', 'publication', NULL, 'published', NULL, NULL, 'Temporary published-data diagnosis for Testphora borealis.', 'TEST description.', NULL, '2026-10-05 23:55:31', '2026-10-22 23:35:58'),
(5, 2, 6, 'female', 'new_observations', NULL, 'new_interpretation', NULL, NULL, 'Temporary diagnosis for Testphora sp. Prairie 1.', 'TEST description based on new observations.', NULL, '2026-10-05 23:55:31', '2026-10-05 23:55:31'),
(6, 3, 5, 'female', 'mixed', NULL, 'new_interpretation', NULL, NULL, 'Temporary mixed-source diagnosis for Testphora occidentalis.', 'TEST description using published information and new observations.', NULL, '2026-10-05 23:55:31', '2026-10-05 23:55:31');

-- --------------------------------------------------------

--
-- Table structure for table `specimen_observations`
--

CREATE TABLE `specimen_observations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `specimen_reference_id` bigint(20) UNSIGNED NOT NULL,
  `character_id` bigint(20) UNSIGNED NOT NULL,
  `numeric_min` decimal(12,6) DEFAULT NULL,
  `numeric_max` decimal(12,6) DEFAULT NULL,
  `observation_basis` enum('direct_exam','publication','other') NOT NULL DEFAULT 'direct_exam',
  `observed_by_uid` varchar(128) DEFAULT NULL,
  `attribution_text` varchar(255) DEFAULT NULL,
  `source_publication_id` bigint(20) UNSIGNED DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Table structure for table `specimen_observation_states`
--

CREATE TABLE `specimen_observation_states` (
  `specimen_observation_id` bigint(20) UNSIGNED NOT NULL,
  `character_id` bigint(20) UNSIGNED NOT NULL,
  `state_id` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `specimen_references`
--

CREATE TABLE `specimen_references` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reference_type` enum('gbif','local','publication') NOT NULL,
  `gbif_occurrence_key` bigint(20) UNSIGNED DEFAULT NULL,
  `publication_id` bigint(20) UNSIGNED DEFAULT NULL,
  `institution_code` varchar(64) DEFAULT NULL,
  `catalog_number` varchar(128) DEFAULT NULL,
  `specimen_label` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `specimen_references`
--

INSERT INTO `specimen_references` (`id`, `reference_type`, `gbif_occurrence_key`, `publication_id`, `institution_code`, `catalog_number`, `specimen_label`, `notes`, `created_at`, `updated_at`) VALUES
(1, 'local', NULL, NULL, 'TEST', '001', 'Temporary test specimen', 'Temporary record for testing description/specimen relationships.', '2026-10-05 22:23:11', '2026-10-05 22:23:11');

-- --------------------------------------------------------

--
-- Table structure for table `workspaces`
--

CREATE TABLE `workspaces` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `owner_uid` varchar(128) DEFAULT NULL,
  `visibility` enum('private','shared','public') NOT NULL DEFAULT 'private',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `workspaces`
--

INSERT INTO `workspaces` (`id`, `name`, `description`, `owner_uid`, `visibility`, `created_at`, `updated_at`) VALUES
(1, 'Myriophora', 'Structured species descriptions and identification data for Myriophora.', NULL, 'private', '2026-09-25 01:13:24', '2026-09-25 01:13:24'),
(2, 'TEST Canada Revision', 'Temporary Canadian Testphora workspace.', NULL, 'private', '2026-10-05 23:49:08', '2026-10-05 23:49:08'),
(3, 'TEST USA Revision', 'Temporary United States Testphora workspace.', NULL, 'private', '2026-10-05 23:49:08', '2026-10-05 23:49:08'),
(4, 'POSTMAN TEST 1792637159301 Workspace', 'Temporary Postman CRUD workspace', 'FQuQCTnfiwYVRnhTai66vqnA9L73', 'private', '2026-10-22 02:45:59', '2026-10-22 02:45:59');

-- --------------------------------------------------------

--
-- Table structure for table `workspace_characters`
--

CREATE TABLE `workspace_characters` (
  `workspace_id` bigint(20) UNSIGNED NOT NULL,
  `character_id` bigint(20) UNSIGNED NOT NULL,
  `display_order` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `workspace_characters`
--

INSERT INTO `workspace_characters` (`workspace_id`, `character_id`, `display_order`, `created_at`) VALUES
(1, 1, 20, '2026-09-25 22:20:36'),
(1, 2, 10, '2026-09-25 22:20:36'),
(2, 3, 30, '2026-10-05 23:52:55'),
(2, 4, 20, '2026-10-05 23:52:55'),
(2, 5, 10, '2026-10-05 23:52:55'),
(3, 3, 20, '2026-10-05 23:52:55'),
(3, 4, 30, '2026-10-05 23:52:55'),
(3, 5, 10, '2026-10-05 23:52:55');

-- --------------------------------------------------------

--
-- Table structure for table `workspace_species`
--

CREATE TABLE `workspace_species` (
  `workspace_id` bigint(20) UNSIGNED NOT NULL,
  `species_id` bigint(20) UNSIGNED NOT NULL,
  `display_order` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `workspace_species`
--

INSERT INTO `workspace_species` (`workspace_id`, `species_id`, `display_order`, `created_at`) VALUES
(1, 2, 10, '2026-09-25 22:37:33'),
(1, 3, 20, '2026-09-25 22:37:33'),
(2, 4, 10, '2026-10-05 23:52:55'),
(2, 6, 20, '2026-10-05 23:52:55'),
(3, 5, 10, '2026-10-05 23:52:55');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `characters`
--
ALTER TABLE `characters`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_character_name` (`name`),
  ADD KEY `idx_character_region` (`anatomical_region`),
  ADD KEY `idx_character_creator` (`created_by_uid`),
  ADD KEY `idx_character_visibility` (`visibility`);

--
-- Indexes for table `character_observations`
--
ALTER TABLE `character_observations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_description_character` (`description_id`,`character_id`),
  ADD UNIQUE KEY `uq_observation_character` (`id`,`character_id`),
  ADD UNIQUE KEY `uq_character_observation_description_character` (`id`,`description_id`,`character_id`),
  ADD KEY `idx_character_observations_character` (`character_id`);

--
-- Indexes for table `character_observation_publications`
--
ALTER TABLE `character_observation_publications`
  ADD PRIMARY KEY (`character_observation_id`,`publication_id`),
  ADD KEY `idx_character_observation_publications_publication` (`publication_id`);

--
-- Indexes for table `character_observation_specimen_evidence`
--
ALTER TABLE `character_observation_specimen_evidence`
  ADD PRIMARY KEY (`character_observation_id`,`specimen_observation_id`),
  ADD KEY `idx_cose_description_specimen` (`description_id`,`specimen_reference_id`),
  ADD KEY `idx_cose_specimen_observation` (`specimen_observation_id`,`specimen_reference_id`,`character_id`),
  ADD KEY `idx_cose_character_observation` (`character_observation_id`,`description_id`,`character_id`);

--
-- Indexes for table `character_states`
--
ALTER TABLE `character_states`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_character_state_name` (`character_id`,`name`),
  ADD UNIQUE KEY `uq_state_character` (`id`,`character_id`),
  ADD KEY `idx_character_states_character` (`character_id`);

--
-- Indexes for table `description_publications`
--
ALTER TABLE `description_publications`
  ADD PRIMARY KEY (`description_id`,`publication_id`),
  ADD KEY `idx_description_publications_publication` (`publication_id`);

--
-- Indexes for table `description_specimens`
--
ALTER TABLE `description_specimens`
  ADD PRIMARY KEY (`description_id`,`specimen_reference_id`),
  ADD KEY `idx_description_specimens_specimen` (`specimen_reference_id`);

--
-- Indexes for table `description_specimen_publications`
--
ALTER TABLE `description_specimen_publications`
  ADD PRIMARY KEY (`description_id`,`specimen_reference_id`,`publication_id`),
  ADD KEY `idx_description_specimen_publications_publication` (`publication_id`);

--
-- Indexes for table `identification_keys`
--
ALTER TABLE `identification_keys`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_identification_keys_status` (`status`),
  ADD KEY `idx_identification_keys_origin` (`origin`),
  ADD KEY `idx_identification_keys_creator` (`created_by_uid`),
  ADD KEY `fk_identification_keys_source_publication` (`source_publication_id`);

--
-- Indexes for table `key_characters`
--
ALTER TABLE `key_characters`
  ADD PRIMARY KEY (`key_id`,`character_id`),
  ADD KEY `idx_key_characters_character` (`character_id`);

--
-- Indexes for table `key_descriptions`
--
ALTER TABLE `key_descriptions`
  ADD PRIMARY KEY (`key_id`,`description_id`),
  ADD KEY `idx_key_descriptions_description` (`description_id`);

--
-- Indexes for table `observation_states`
--
ALTER TABLE `observation_states`
  ADD PRIMARY KEY (`observation_id`,`state_id`),
  ADD KEY `idx_observation_states_state` (`state_id`),
  ADD KEY `idx_observation_states_character` (`character_id`),
  ADD KEY `fk_observation_states_observation` (`observation_id`,`character_id`),
  ADD KEY `fk_observation_states_state` (`state_id`,`character_id`);

--
-- Indexes for table `publications`
--
ALTER TABLE `publications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_publications_short_label` (`short_label`),
  ADD KEY `idx_publications_doi` (`doi`);

--
-- Indexes for table `species`
--
ALTER TABLE `species`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_species_gbif_taxon_key` (`gbif_taxon_key`),
  ADD KEY `idx_species_name` (`genus`,`specific_epithet`),
  ADD KEY `idx_species_genus` (`genus`),
  ADD KEY `idx_species_status` (`species_status`);

--
-- Indexes for table `species_descriptions`
--
ALTER TABLE `species_descriptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_species_descriptions_species` (`species_id`),
  ADD KEY `idx_species_descriptions_workspace_species_sex` (`workspace_id`,`species_id`,`sex_scope`),
  ADD KEY `idx_species_descriptions_derived_from` (`derived_from_description_id`);

--
-- Indexes for table `specimen_observations`
--
ALTER TABLE `specimen_observations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_specimen_observation_character` (`id`,`character_id`),
  ADD UNIQUE KEY `uq_specimen_observation_specimen_character` (`id`,`specimen_reference_id`,`character_id`),
  ADD KEY `idx_specimen_observations_specimen` (`specimen_reference_id`),
  ADD KEY `idx_specimen_observations_character` (`character_id`),
  ADD KEY `idx_specimen_observations_observer` (`observed_by_uid`),
  ADD KEY `idx_specimen_observations_source_publication` (`source_publication_id`);

--
-- Indexes for table `specimen_observation_states`
--
ALTER TABLE `specimen_observation_states`
  ADD PRIMARY KEY (`specimen_observation_id`,`state_id`),
  ADD KEY `idx_specimen_observation_states_state` (`state_id`),
  ADD KEY `idx_specimen_observation_states_character` (`character_id`),
  ADD KEY `fk_specimen_observation_states_observation` (`specimen_observation_id`,`character_id`),
  ADD KEY `fk_specimen_observation_states_state` (`state_id`,`character_id`);

--
-- Indexes for table `specimen_references`
--
ALTER TABLE `specimen_references`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_specimen_gbif_occurrence` (`gbif_occurrence_key`),
  ADD KEY `idx_specimen_catalog` (`institution_code`,`catalog_number`),
  ADD KEY `idx_specimen_publication` (`publication_id`);

--
-- Indexes for table `workspaces`
--
ALTER TABLE `workspaces`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_workspace_owner` (`owner_uid`),
  ADD KEY `idx_workspace_visibility` (`visibility`);

--
-- Indexes for table `workspace_characters`
--
ALTER TABLE `workspace_characters`
  ADD PRIMARY KEY (`workspace_id`,`character_id`),
  ADD KEY `idx_workspace_characters_character` (`character_id`);

--
-- Indexes for table `workspace_species`
--
ALTER TABLE `workspace_species`
  ADD PRIMARY KEY (`workspace_id`,`species_id`),
  ADD KEY `idx_workspace_species_species` (`species_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `characters`
--
ALTER TABLE `characters`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `character_observations`
--
ALTER TABLE `character_observations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `character_states`
--
ALTER TABLE `character_states`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT for table `identification_keys`
--
ALTER TABLE `identification_keys`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `publications`
--
ALTER TABLE `publications`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `species`
--
ALTER TABLE `species`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `species_descriptions`
--
ALTER TABLE `species_descriptions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `specimen_observations`
--
ALTER TABLE `specimen_observations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `specimen_references`
--
ALTER TABLE `specimen_references`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `workspaces`
--
ALTER TABLE `workspaces`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `character_observations`
--
ALTER TABLE `character_observations`
  ADD CONSTRAINT `fk_character_observations_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`),
  ADD CONSTRAINT `fk_character_observations_description` FOREIGN KEY (`description_id`) REFERENCES `species_descriptions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `character_observation_publications`
--
ALTER TABLE `character_observation_publications`
  ADD CONSTRAINT `fk_character_observation_publications_observation` FOREIGN KEY (`character_observation_id`) REFERENCES `character_observations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_character_observation_publications_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`);

--
-- Constraints for table `character_observation_specimen_evidence`
--
ALTER TABLE `character_observation_specimen_evidence`
  ADD CONSTRAINT `fk_cose_character_observation` FOREIGN KEY (`character_observation_id`,`description_id`,`character_id`) REFERENCES `character_observations` (`id`, `description_id`, `character_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_cose_description_specimen` FOREIGN KEY (`description_id`,`specimen_reference_id`) REFERENCES `description_specimens` (`description_id`, `specimen_reference_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_cose_specimen_observation` FOREIGN KEY (`specimen_observation_id`,`specimen_reference_id`,`character_id`) REFERENCES `specimen_observations` (`id`, `specimen_reference_id`, `character_id`) ON DELETE CASCADE;

--
-- Constraints for table `character_states`
--
ALTER TABLE `character_states`
  ADD CONSTRAINT `fk_character_states_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `description_publications`
--
ALTER TABLE `description_publications`
  ADD CONSTRAINT `fk_description_publications_description` FOREIGN KEY (`description_id`) REFERENCES `species_descriptions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_description_publications_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`);

--
-- Constraints for table `description_specimens`
--
ALTER TABLE `description_specimens`
  ADD CONSTRAINT `fk_description_specimens_description` FOREIGN KEY (`description_id`) REFERENCES `species_descriptions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_description_specimens_specimen` FOREIGN KEY (`specimen_reference_id`) REFERENCES `specimen_references` (`id`);

--
-- Constraints for table `description_specimen_publications`
--
ALTER TABLE `description_specimen_publications`
  ADD CONSTRAINT `fk_description_specimen_publications_description_specimen` FOREIGN KEY (`description_id`,`specimen_reference_id`) REFERENCES `description_specimens` (`description_id`, `specimen_reference_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_description_specimen_publications_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`);

--
-- Constraints for table `identification_keys`
--
ALTER TABLE `identification_keys`
  ADD CONSTRAINT `fk_identification_keys_source_publication` FOREIGN KEY (`source_publication_id`) REFERENCES `publications` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `key_characters`
--
ALTER TABLE `key_characters`
  ADD CONSTRAINT `fk_key_characters_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`),
  ADD CONSTRAINT `fk_key_characters_key` FOREIGN KEY (`key_id`) REFERENCES `identification_keys` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `key_descriptions`
--
ALTER TABLE `key_descriptions`
  ADD CONSTRAINT `fk_key_descriptions_description` FOREIGN KEY (`description_id`) REFERENCES `species_descriptions` (`id`),
  ADD CONSTRAINT `fk_key_descriptions_key` FOREIGN KEY (`key_id`) REFERENCES `identification_keys` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `observation_states`
--
ALTER TABLE `observation_states`
  ADD CONSTRAINT `fk_observation_states_observation` FOREIGN KEY (`observation_id`,`character_id`) REFERENCES `character_observations` (`id`, `character_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_observation_states_state` FOREIGN KEY (`state_id`,`character_id`) REFERENCES `character_states` (`id`, `character_id`);

--
-- Constraints for table `species_descriptions`
--
ALTER TABLE `species_descriptions`
  ADD CONSTRAINT `fk_species_descriptions_derived_from` FOREIGN KEY (`derived_from_description_id`) REFERENCES `species_descriptions` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_species_descriptions_workspace_species` FOREIGN KEY (`workspace_id`,`species_id`) REFERENCES `workspace_species` (`workspace_id`, `species_id`) ON DELETE CASCADE;

--
-- Constraints for table `specimen_observations`
--
ALTER TABLE `specimen_observations`
  ADD CONSTRAINT `fk_specimen_observations_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`),
  ADD CONSTRAINT `fk_specimen_observations_source_publication` FOREIGN KEY (`source_publication_id`) REFERENCES `publications` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_specimen_observations_specimen` FOREIGN KEY (`specimen_reference_id`) REFERENCES `specimen_references` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `specimen_observation_states`
--
ALTER TABLE `specimen_observation_states`
  ADD CONSTRAINT `fk_specimen_observation_states_observation` FOREIGN KEY (`specimen_observation_id`,`character_id`) REFERENCES `specimen_observations` (`id`, `character_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_specimen_observation_states_state` FOREIGN KEY (`state_id`,`character_id`) REFERENCES `character_states` (`id`, `character_id`);

--
-- Constraints for table `specimen_references`
--
ALTER TABLE `specimen_references`
  ADD CONSTRAINT `fk_specimen_reference_publication` FOREIGN KEY (`publication_id`) REFERENCES `publications` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `workspace_characters`
--
ALTER TABLE `workspace_characters`
  ADD CONSTRAINT `fk_workspace_characters_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_workspace_characters_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `workspace_species`
--
ALTER TABLE `workspace_species`
  ADD CONSTRAINT `fk_workspace_species_species` FOREIGN KEY (`species_id`) REFERENCES `species` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_workspace_species_workspace` FOREIGN KEY (`workspace_id`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
