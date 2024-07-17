import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import SampleObjectDatastore from "../datastores/sample_datastore.ts";

/**
 * Functions are reusable building blocks of automation that accept
 * inputs, perform calculations, and provide outputs. Functions can
 * be used independently or as steps in workflows.
 * https://api.slack.com/automation/functions/custom
 */
export const SampleFunctionDefinition = DefineFunction({
  callback_id: "sample_function",
  title: "Sample function",
  description: "A sample function",
  source_file: "functions/sample_function.ts",
  input_parameters: {
    properties: {
      channel: {
        type: Schema.slack.types.channel_id,
        description: "what channel to scrape",
      },
    },
    required: ["channel"],
  },
  output_parameters: {
    properties: {
      updatedMsg: {
        type: Schema.types.string,
        description: "Updated message to be posted",
      },
    },
    required: ["updatedMsg"],
  },
});

interface Message {
  user: string;
  object_id: string;
  text: string;
  ts: string;
  reply_count: number;
  thread_ts: string;
}

/**
 * SlackFunction takes in two arguments: the CustomFunction
 * definition (see above), as well as a function that contains
 * handler logic that's run when the function is executed.
 * https://api.slack.com/automation/functions/custom
 */
export default SlackFunction(
  SampleFunctionDefinition,
  async ({ inputs, client }) => {
    console.log("Forwarding the following time off request:", inputs);

    // ...

    // Send the message to the manager
    const joinChannelRes = await client.conversations.join({
      channel: inputs.channel,
      // Fallback text to use when rich media can't be displayed (i.e. notifications) as well as for screen readers
    });

    if (!joinChannelRes.ok) {
      console.log(
        "Error during request conversations.join!",
        joinChannelRes.error,
      );
    }

    let historyRes = await client.conversations.history({
      channel: inputs.channel,
      // Fallback text to use when rich media can't be displayed (i.e. notifications) as well as for screen readers
    });

    if (!historyRes.ok) {
      console.log(
        "Error during request conversations.history!",
        historyRes.error,
      );
    }
    console.log(`fetching from ${inputs.channel}`);

    const messages = (historyRes.messages as Array<
      { user: string; object_id: string; text: string; ts: string }
    >).map((it) => {
      console.log(it);
      return {
        user: it.user.toString(),
        message: it.text.toString(),
        object_id: crypto.randomUUID().toString(),
      };
    });
    while (messages.length > 0) {
      const putResp = await client.apps.datastore.bulkPut<
        typeof SampleObjectDatastore.definition
      >({
        datastore: SampleObjectDatastore.name,
        items: messages.splice(0, Math.min(messages.length, 25)),
      });

      if (!putResp.ok) {
        console.log(
          "Error during request datastore.bulkPu!",
          putResp.error,
        );
      }

      console.log(messages.length);
    }

    for (let i = 0; i < 2; i++) {
      if (!historyRes.response_metadata?.next_cursor) {
        break;
      }
      historyRes = await client.conversations.history({
        channel: inputs.channel,
        cursor: historyRes.response_metadata.next_cursor,
        // Fallback text to use when rich media can't be displayed (i.e. notifications) as well as for screen readers
      });

      if (!historyRes.ok) {
        console.log(
          "Error during request conversations.history!",
          historyRes.error,
        );
      }
      console.log(`fetching from ${inputs.channel}`);

      const messages = (historyRes.messages as Array<
        Message
      >).map((it) => {
        return {
          user: it.user.toString(),
          message: it.text.toString(),
          object_id: crypto.randomUUID().toString(),
          reply_count: it.reply_count,
          thread_ts: it.thread_ts,
        };
      });

      while (messages.length > 0) {
        const msgs = messages.splice(0, Math.min(messages.length, 25)).map(
          async (it) => {
            let message: {
              message: string;
              object_id: string;
              replies?: Array<string>;
            } = {
              message: it.message,
              object_id: it.object_id,
            };

            if (it.reply_count > 0) {
              const repliesRes = await client.conversations.replies({
                channel: inputs.channel,
                ts: it.thread_ts,
                // Fallback text to use when rich media can't be displayed (i.e. notifications) as well as for screen readers
              });
              if (!repliesRes.ok) {
                console.log("Error getting replies", repliesRes.error);
                return message;
              }

              message = {
                ...message,
                replies: (repliesRes.messages as Array<
                  Message
                >).reduce((acc, it) => {
                  acc.push(it.text);
                  return acc;
                }, [] as Array<string>),
              };
            }
            return message;
          },
        );
        const putResp = await client.apps.datastore.bulkPut<
          typeof SampleObjectDatastore.definition
        >({
          datastore: SampleObjectDatastore.name,
          items: (await Promise.all(msgs)).map((it) => {
            return {
              ...it,
              replies: it.replies
                ? it.replies.join(`
              `)
                : "",
            };
          }),
        });

        if (!putResp.ok) {
          console.log(
            "Error during request datastore.bulkPu!",
            putResp.error,
          );
        }
        console.log(messages.length);
      }
    }

    // IMPORTANT! Set `completed` to false in order to keep the interactivity
    // points (the approve/deny buttons) "alive"
    // We will set the function's complete state in the button handlers below.
    return {
      completed: false,
    };
  },
);
