import { createSequelizeInstance } from '../src/config/database.js';
import { initModels } from '../src/database/models/index.js';
const db = createSequelizeInstance();
const models = initModels(db);
let issues = 0;
for (const [name, model] of Object.entries(models)) {
  if (name === 'sequelize') continue;
  const m = model as typeof models.City;
  try {
    const columns = await db.getQueryInterface().describeTable(m.getTableName());
    const missing = Object.values(m.getAttributes()).map(a => a.field).filter(f => f && !columns[f]);
    if (missing.length) { console.log(name + ': missing ' + missing.join(', ')); issues++; }
  } catch { console.log(name + ': table unavailable'); issues++; }
}
console.log('Schema issues: ' + issues);
await db.close();
