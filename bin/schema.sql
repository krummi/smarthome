
CREATE TABLE IF NOT EXISTS "Accounts" (
    id uuid NOT NULL,

    "email" character varying(255),
    "password" character varying(255),

    "name" character varying(255),
    "avatarUrl" character varying(255),

    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone
);

CREATE TYPE recipeType AS ENUM ('link', 'recipe');
CREATE TABLE IF NOT EXISTS "Recipes" (
  id uuid NOT NULL,

  type recipeType,
  title character varying(256),
  bodyHtml TEXT,
  ingredients JSON,
  tags character varying(64) ARRAY,
  link character varying(256) ,

  "createdAt" timestamp with time zone,
  "updatedAt" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "Products" (
  id uuid NOT NULL,

  "barcode" character varying(64),
  "title" character varying(128)
);