import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import plist, { PlistValue } from "plist";

function buildShortcutPlist(apiKey: string, baseUrl: string) {
  return {
    WFWorkflowMinimumClientVersionString: "900",
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowClientVersion: 2302,
    WFWorkflowIcon: {
      WFWorkflowIconStartColor: 463140863, // blue
      WFWorkflowIconGlyphNumber: 59493, // person icon
    },
    WFWorkflowInputContentItemClasses: [
      "WFStringContentItem",
      "WFURLContentItem",
    ],
    WFWorkflowName: "People Notes",
    WFWorkflowActions: [
      // Action 1: Receive input from share sheet
      // (The shortcut input is automatically available as "Shortcut Input")

      // Action 2: Build JSON body with the transcript
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.urlencode",
        WFWorkflowActionParameters: {
          WFInput: {
            Value: {
              string: "\uFFFC",
              attachmentsByRange: {
                "{0, 1}": {
                  Type: "ExtensionInput",
                  Aggrandizements: [],
                },
              },
            },
            WFSerializationType: "WFTextTokenString",
          },
          WFEncodeMode: "Encode",
        },
      },

      // Action 3: Set variable for the input text
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.setvariable",
        WFWorkflowActionParameters: {
          WFVariableName: "TranscriptText",
        },
      },

      // Action 4: Create JSON dictionary
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.dictionary",
        WFWorkflowActionParameters: {
          WFItems: {
            Value: {
              WFDictionaryFieldValueItems: [
                {
                  WFItemType: 0,
                  WFKey: {
                    Value: { string: "transcript" },
                    WFSerializationType: "WFTextTokenString",
                  },
                  WFValue: {
                    Value: {
                      string: "\uFFFC",
                      attachmentsByRange: {
                        "{0, 1}": {
                          Type: "Variable",
                          VariableName: "TranscriptText",
                          Aggrandizements: [],
                        },
                      },
                    },
                    WFSerializationType: "WFTextTokenString",
                  },
                },
              ],
            },
            WFSerializationType: "WFDictionaryFieldValue",
          },
        },
      },

      // Action 5: Get Contents of URL (POST to /api/ingest)
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.downloadurl",
        WFWorkflowActionParameters: {
          WFURL: `${baseUrl}/api/ingest`,
          WFHTTPMethod: "POST",
          WFHTTPBodyType: "Json",
          WFHTTPHeaders: {
            Value: {
              WFDictionaryFieldValueItems: [
                {
                  WFItemType: 0,
                  WFKey: {
                    Value: { string: "x-api-key" },
                    WFSerializationType: "WFTextTokenString",
                  },
                  WFValue: {
                    Value: { string: apiKey },
                    WFSerializationType: "WFTextTokenString",
                  },
                },
                {
                  WFItemType: 0,
                  WFKey: {
                    Value: { string: "Content-Type" },
                    WFSerializationType: "WFTextTokenString",
                  },
                  WFValue: {
                    Value: { string: "application/json" },
                    WFSerializationType: "WFTextTokenString",
                  },
                },
              ],
            },
            WFSerializationType: "WFDictionaryFieldValue",
          },
          WFJSONValues: {
            Value: {
              WFDictionaryFieldValueItems: [
                {
                  WFItemType: 0,
                  WFKey: {
                    Value: { string: "transcript" },
                    WFSerializationType: "WFTextTokenString",
                  },
                  WFValue: {
                    Value: {
                      string: "\uFFFC",
                      attachmentsByRange: {
                        "{0, 1}": {
                          Type: "Variable",
                          VariableName: "TranscriptText",
                          Aggrandizements: [],
                        },
                      },
                    },
                    WFSerializationType: "WFTextTokenString",
                  },
                },
              ],
            },
            WFSerializationType: "WFDictionaryFieldValue",
          },
        },
      },

      // Action 6: Get dictionary value (reviewUrl)
      {
        WFWorkflowActionIdentifier:
          "is.workflow.actions.getvalueforkey",
        WFWorkflowActionParameters: {
          WFDictionaryKey: "reviewUrl",
        },
      },

      // Action 7: Open URL in Safari
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.openurl",
        WFWorkflowActionParameters: {},
      },
    ],
  };
}

// GET /api/settings/shortcut - Download personalised .shortcut file
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ apiKey: users.apiKey })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app";

  const shortcutData = buildShortcutPlist(user.apiKey, baseUrl);
  const xml = plist.build(shortcutData as unknown as PlistValue);

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/x-apple-shortcut",
      "Content-Disposition":
        'attachment; filename="PeopleNotes.shortcut"',
    },
  });
}
