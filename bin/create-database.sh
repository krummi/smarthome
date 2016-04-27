createdb smarthome -U postgres &&
psql smarthome -U postgres -c "CREATE EXTENSION \"uuid-ossp\";" &&
psql -U postgres smarthome < schema.sql
