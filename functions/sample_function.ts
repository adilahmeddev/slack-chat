import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

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
    try {
      // ...

      // Send the message to the manager

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

          console.log("got replies, sending to google");
          const reqBody = {
            instances: (await Promise.all(msgs)).map((it) => {
              return {
                task_type: "RETRIEVAL_DOCUMENT",
                title: it.message,
                content: it.replies
                  ? it.replies.join(`
              `)
                  : it.message,
              };
            }).filter((it) => it.content != "" && it.title != ""),
          };

          const aiRes = await fetch(
            "https://us-central1-aiplatform.googleapis.com/v1/projects/gen-lang-client-0765264100/locations/us-central1/publishers/google/models/text-embedding-004:predict",
            {
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer REPLACE WITH UR ACCESS TOKEN",
              },
              method: "POST",
              body: (JSON.stringify(reqBody)),
            },
          );
          if (!aiRes.ok) {
            console.log(
              "Error during request api embed!",
              await aiRes.json(),
            );
            continue;
          }
          const rs = await aiRes.text();
          await Deno.writeTextFile("./hello.json", rs);
          //console.log(
          //rs          );
        }
      }
    } catch (e) {
      console.log("exception", e);
    }

    // IMPORTANT! Set `completed` to false in order to keep the interactivity
    // points (the approve/deny buttons) "alive"
    // We will set the function's complete state in the button handlers below.
    return {
      completed: false,
    };
  },
);
