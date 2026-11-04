import { describeComposeStorage } from "./composeStorageSuite";

describeComposeStorage(new URL("./docker-compose.yml", import.meta.url));
