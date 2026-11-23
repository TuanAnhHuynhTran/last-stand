'use strict';

/**
 * Phase 12 — friends & visits, PvP (seasons, ratings, queue, rooms, matches), alliances.
 *  - friendships: UNIQUE (user_a_id, user_b_id) with user_a_id < user_b_id → one row per pair
 *  - pvp_ratings: UNIQUE (season, user); pvp_queue: UNIQUE user; pvp_matches: UNIQUE battle
 *    (a duel is rated exactly once)
 *  - alliance_members: UNIQUE user (one alliance per player); alliances: UNIQUE name and tag
 *  - cities.visibility: public / friends / private (who may visit read-only)
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    };
    const id = () => ({ type: Sequelize.CHAR(36), primaryKey: true, allowNull: false });
    const fk = (model, allowNull = false) => ({
      type: Sequelize.CHAR(36),
      allowNull,
      references: { model, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: allowNull ? 'SET NULL' : 'CASCADE',
    });

    await queryInterface.addColumn('cities', 'visibility', { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'public' });
    await queryInterface.sequelize.query("UPDATE cities SET visibility = CASE WHEN is_public = 1 THEN 'public' ELSE 'private' END");
    await queryInterface.addIndex('battle_instances', ['mission_code', 'status'], { name: 'idx_battle_instances_mission_status' });
    await queryInterface.addIndex('battle_participants', ['user_id'], { name: 'idx_battle_participants_user' });

    // ── Friends ──────────────────────────────────────────────────────────────
    await queryInterface.createTable('friend_requests', {
      id: id(),
      from_user_id: fk('users'),
      to_user_id: fk('users'),
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'pending' },
      responded_at: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex('friend_requests', ['to_user_id', 'status'], { name: 'idx_friend_requests_to' });
    await queryInterface.addIndex('friend_requests', ['from_user_id', 'status', 'created_at'], { name: 'idx_friend_requests_from' });

    await queryInterface.createTable('friendships', { id: id(), user_a_id: fk('users'), user_b_id: fk('users'), ...ts });
    await queryInterface.addIndex('friendships', ['user_a_id', 'user_b_id'], { unique: true, name: 'uq_friendships_pair' });
    await queryInterface.addIndex('friendships', ['user_b_id'], { name: 'idx_friendships_b' });

    await queryInterface.createTable('notifications', {
      id: id(),
      user_id: fk('users'),
      actor_user_id: fk('users', true),
      kind: { type: Sequelize.STRING(24), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      read_at: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex('notifications', ['user_id', 'created_at'], { name: 'idx_notifications_user' });
    await queryInterface.addIndex('notifications', ['actor_user_id', 'kind', 'created_at'], { name: 'idx_notifications_actor' });

    // ── PvP ──────────────────────────────────────────────────────────────────
    await queryInterface.createTable('pvp_seasons', {
      id: id(),
      number: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(40), allowNull: false },
      starts_at: { type: Sequelize.DATE, allowNull: false },
      ends_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('pvp_seasons', ['number'], { unique: true, name: 'uq_pvp_seasons_number' });

    await queryInterface.createTable('pvp_ratings', {
      id: id(),
      season_id: fk('pvp_seasons'),
      user_id: fk('users'),
      rating: { type: Sequelize.INTEGER, allowNull: false },
      wins: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      losses: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      draws: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex('pvp_ratings', ['season_id', 'user_id'], { unique: true, name: 'uq_pvp_ratings_season_user' });
    await queryInterface.addIndex('pvp_ratings', ['season_id', 'rating'], { name: 'idx_pvp_ratings_leaderboard' });

    await queryInterface.createTable('pvp_queue', {
      id: id(),
      user_id: fk('users'),
      city_id: fk('cities'),
      unit_ids: { type: Sequelize.JSON, allowNull: false },
      rating: { type: Sequelize.INTEGER, allowNull: false },
      games: { type: Sequelize.INTEGER, allowNull: false },
      power: { type: Sequelize.INTEGER, allowNull: false },
      enqueued_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('pvp_queue', ['user_id'], { unique: true, name: 'uq_pvp_queue_user' });

    await queryInterface.createTable('pvp_rooms', {
      id: id(),
      host_user_id: fk('users'),
      guest_user_id: fk('users', true),
      invited_user_id: fk('users', true),
      ranked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: Sequelize.STRING(16), allowNull: false },
      host_unit_ids: { type: Sequelize.JSON, allowNull: false },
      guest_unit_ids: { type: Sequelize.JSON, allowNull: false },
      battle_id: fk('battle_instances', true),
      expires_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('pvp_rooms', ['host_user_id', 'status'], { name: 'idx_pvp_rooms_host' });
    await queryInterface.addIndex('pvp_rooms', ['guest_user_id', 'status'], { name: 'idx_pvp_rooms_guest' });
    await queryInterface.addIndex('pvp_rooms', ['invited_user_id', 'status'], { name: 'idx_pvp_rooms_invited' });

    await queryInterface.createTable('pvp_matches', {
      id: id(),
      battle_id: fk('battle_instances'),
      season_id: fk('pvp_seasons'),
      host_user_id: fk('users'),
      guest_user_id: fk('users'),
      winner_user_id: fk('users', true),
      host_rating_before: { type: Sequelize.INTEGER, allowNull: false },
      host_rating_after: { type: Sequelize.INTEGER, allowNull: false },
      guest_rating_before: { type: Sequelize.INTEGER, allowNull: false },
      guest_rating_after: { type: Sequelize.INTEGER, allowNull: false },
      reason: { type: Sequelize.STRING(16), allowNull: false },
      ended_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('pvp_matches', ['battle_id'], { unique: true, name: 'uq_pvp_matches_battle' });
    await queryInterface.addIndex('pvp_matches', ['host_user_id', 'ended_at'], { name: 'idx_pvp_matches_host' });
    await queryInterface.addIndex('pvp_matches', ['guest_user_id', 'ended_at'], { name: 'idx_pvp_matches_guest' });

    // ── Alliances ────────────────────────────────────────────────────────────
    await queryInterface.createTable('alliances', {
      id: id(),
      name: { type: Sequelize.STRING(24), allowNull: false },
      tag: { type: Sequelize.STRING(5), allowNull: false },
      description: { type: Sequelize.STRING(300), allowNull: false, defaultValue: '' },
      leader_user_id: fk('users'),
      ...ts,
    });
    await queryInterface.addIndex('alliances', ['name'], { unique: true, name: 'uq_alliances_name' });
    await queryInterface.addIndex('alliances', ['tag'], { unique: true, name: 'uq_alliances_tag' });

    await queryInterface.createTable('alliance_roles', {
      id: id(),
      alliance_id: fk('alliances'),
      code: { type: Sequelize.STRING(16), allowNull: false },
      name: { type: Sequelize.STRING(32), allowNull: false },
      rank: { type: Sequelize.INTEGER, allowNull: false },
      permissions: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('alliance_roles', ['alliance_id', 'code'], { unique: true, name: 'uq_alliance_roles_code' });

    await queryInterface.createTable('alliance_members', {
      id: id(),
      alliance_id: fk('alliances'),
      user_id: fk('users'),
      role_code: { type: Sequelize.STRING(16), allowNull: false },
      contribution: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      joined_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('alliance_members', ['user_id'], { unique: true, name: 'uq_alliance_members_user' });
    await queryInterface.addIndex('alliance_members', ['alliance_id'], { name: 'idx_alliance_members_alliance' });

    await queryInterface.createTable('alliance_messages', {
      id: id(),
      alliance_id: fk('alliances'),
      user_id: fk('users'),
      body: { type: Sequelize.STRING(500), allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('alliance_messages', ['alliance_id', 'created_at'], { name: 'idx_alliance_messages_feed' });
    await queryInterface.addIndex('alliance_messages', ['user_id', 'created_at'], { name: 'idx_alliance_messages_user' });

    await queryInterface.createTable('alliance_invites', {
      id: id(),
      alliance_id: fk('alliances'),
      user_id: fk('users'),
      invited_by_user_id: fk('users'),
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'pending' },
      ...ts,
    });
    await queryInterface.addIndex('alliance_invites', ['user_id', 'status'], { name: 'idx_alliance_invites_user' });

    await queryInterface.createTable('alliance_quests', {
      id: id(),
      alliance_id: fk('alliances'),
      code: { type: Sequelize.STRING(24), allowNull: false },
      target: { type: Sequelize.INTEGER, allowNull: false },
      progress: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'active' },
      ends_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('alliance_quests', ['alliance_id', 'status'], { name: 'idx_alliance_quests_alliance' });
  },

  async down(queryInterface) {
    for (const table of [
      'alliance_quests',
      'alliance_invites',
      'alliance_messages',
      'alliance_members',
      'alliance_roles',
      'alliances',
      'pvp_matches',
      'pvp_rooms',
      'pvp_queue',
      'pvp_ratings',
      'pvp_seasons',
      'notifications',
      'friendships',
      'friend_requests',
    ]) {
      await queryInterface.dropTable(table);
    }
    await queryInterface.removeIndex('battle_participants', 'idx_battle_participants_user');
    await queryInterface.removeIndex('battle_instances', 'idx_battle_instances_mission_status');
    await queryInterface.removeColumn('cities', 'visibility');
  },
};
