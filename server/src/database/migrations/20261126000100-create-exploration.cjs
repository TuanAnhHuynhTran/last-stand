'use strict';
module.exports = {
  async up(q, S) {
    const base = () => ({
      id: { type: S.CHAR(36), primaryKey: true, allowNull: false },
      city_id: { type: S.CHAR(36), allowNull: false, references: { model: 'cities', key: 'id' }, onDelete: 'CASCADE' },
      created_at: { type: S.DATE, allowNull: false }, updated_at: { type: S.DATE, allowNull: false },
    });
    for (const table of ['world_scan_jobs', 'world_claim_jobs']) {
      await q.createTable(table, { ...base(), idempotency_key: { type: S.STRING(36), allowNull: false }, fingerprint: { type: S.TEXT, allowNull: false }, hexes: { type: S.JSON, allowNull: false }, finishes_at: { type: S.DATE, allowNull: false }, status: { type: S.STRING(16), allowNull: false } });
      await q.addIndex(table, ['city_id', 'idempotency_key'], { unique: true });
      await q.addIndex(table, ['city_id', 'status', 'finishes_at']);
    }
    for (const table of ['world_discoveries', 'world_points_of_interest']) {
      await q.createTable(table, { ...base(), q: { type: S.INTEGER, allowNull: false }, r: { type: S.INTEGER, allowNull: false }, ...(table === 'world_discoveries' ? { status: { type: S.STRING(16), allowNull: false } } : { kind: { type: S.STRING(32), allowNull: false }, reason: { type: S.STRING, allowNull: true } }) });
      await q.addIndex(table, ['city_id', 'q', 'r'], { unique: true });
    }
  },
  async down(q) {
    for (const table of ['world_points_of_interest', 'world_discoveries', 'world_claim_jobs', 'world_scan_jobs']) await q.dropTable(table);
  },
};
