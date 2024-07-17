import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

/**
 * Datastores are a Slack-hosted location to store
 * and retrieve data for your app.
 * https://api.slack.com/automation/datastores
 */
const SampleObjectDatastore = DefineDatastore({
  name: "SampleObjects",
  primary_key: "object_id",
  attributes: {
    object_id: {
      type: Schema.types.string,
    },
    message: {
      type: Schema.types.string,
    },
    user: {
      type: Schema.types.string,
    },
    replies: {
      type: Schema.types.string,
    },
  },
});

export default SampleObjectDatastore;
