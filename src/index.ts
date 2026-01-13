import "dotenv/config";
import { createApp } from "./server.js";

const port = Number(process.env.PORT || 4000);

const app = await createApp();
app.listen(port, () => {
  console.log(`GraphQL running at http://localhost:${port}/graphql`);
});
