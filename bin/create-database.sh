createdb furugrund -U postgres &&
psql furugrund -U postgres -c "CREATE EXTENSION \"uuid-ossp\";" &&
psql -U postgres furugrund < schema.sql
