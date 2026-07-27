import pg from 'pg'; import { randomUUID } from 'crypto';
const c=new pg.Client({host:'127.0.0.1',port:5433,user:'postgres',database:'onair_verify'});
await c.connect();
const t=await c.query("SELECT table_name FROM information_schema.tables WHERE table_name IN ('studio_locations','studio_rooms','studio_bookings','equipment_racks')");
console.log(t.rows.map(r=>r.table_name).join(', '));
for (const tb of ['studio_locations','studio_rooms']) {
  const c2=await c.query("SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position",[tb]);
  console.log(tb+':', c2.rows.filter(r=>r.is_nullable==='NO'&&!r.column_default).map(r=>r.column_name).join(', '));
}
