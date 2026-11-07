// Run offline, against a verified backup. The authorization is confined to this
// one process, rather than leaving a downgrade-enabling variable in the service.
process.env.TANUKI_ALLOW_LEGACY_UPGRADE='1';
const {database,closeDatabase}=await import('../server/lib/database.js');
try{database();console.log('Database upgrade complete. Old sessions were revoked when required.');}finally{closeDatabase();}
