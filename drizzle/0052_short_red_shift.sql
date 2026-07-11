CREATE TABLE "hidden_builtin_fields" (
	"target_entity" "custom_field_target" NOT NULL,
	"field_key" text NOT NULL,
	"hidden_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hidden_builtin_fields_target_entity_field_key_pk" PRIMARY KEY("target_entity","field_key")
);
