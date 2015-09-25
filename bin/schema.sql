
###
### TABLE: Accounts
###
CREATE TABLE IF NOT EXISTS "Accounts" (
    id uuid NOT NULL,

    "email" character varying(255),
    "password" character varying(255),

    "name" character varying(255),
    "avatarUrl" character varying(255),

    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone
);

###
### TABLE: Recipes
###
/*
CREATE TABLE IF NOT EXISTS "Recipes" (
  id uuid NOT NULL,

  body TEXT,
  ingredients JSON
)
*/

###
### TABLE: Products
###
CREATE TABLE IF NOT EXISTS "Products" (
  id uuid NOT NULL,

  "barcode" character varying(64),
  "title" character varying(128)
);
