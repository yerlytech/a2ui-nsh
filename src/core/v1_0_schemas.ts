/**
 * A2UI v1.0 protocol JSON Schemas and Basic Catalog v1 definition written in
 * TypeScript so the pure core operates offline inside QuickJS with zero I/O.
 *
 * Notice: Schema structures, property descriptions, and Basic Catalog v1
 * instructions below reproduce specification text from the A2UI v1.0
 * specification (`a2ui-project/a2ui`, Copyright Google LLC, licensed under the
 * Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0).
 */

import type { JsonObject, JsonValue } from "./json_schema";

export const JSON_SCHEMA_DRAFT_2020_12 =
  "https://json-schema.org/draft/2020-12/schema" as const;

export const COMMON_TYPES_V1_ID =
  "https://a2ui.org/specification/v1_0/common_types.json" as const;

export const AGENT_TO_RENDERER_V1_ID =
  "https://a2ui.org/specification/v1_0/agent_to_renderer.json" as const;

export const BASIC_CATALOG_V1_ID =
  "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json" as const;

function deepCloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneJson(item)) as T;
  }
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = deepCloneJson(v);
  }
  return out as T;
}

const COMMON_TYPES_V1_SCHEMA: JsonObject = {
  $schema: JSON_SCHEMA_DRAFT_2020_12,
  $id: COMMON_TYPES_V1_ID,
  title: "A2UI Common Types",
  description: "Common type definitions used across A2UI schemas.",
  $defs: {
    ComponentId: {
      type: "string",
      description:
        "The unique identifier for a component, used for both definitions and references within the same surface.",
    },
    CallId: {
      type: "string",
      description: "The unique identifier for a function call.",
    },
    AccessibilityAttributes: {
      type: "object",
      description:
        "Attributes to enhance accessibility when using assistive technologies like screen readers or model understanding.",
      properties: {
        label: {
          $ref: "#/$defs/DynamicString",
          description:
            "A short string, typically 1 to 3 words, used by assistive technologies to convey the purpose or intent of an element. For example, an input field might have an accessible label of 'User ID' or a button might be labeled 'Submit'.",
        },
        description: {
          $ref: "#/$defs/DynamicString",
          description:
            "Additional information provided by assistive technologies about an element such as instructions, format requirements, or result of an action. For example, a mute button might have a label of 'Mute' and a description of 'Silences notifications about this conversation'.",
        },
        live: {
          type: "string",
          description:
            "Controls screen reader announcements for dynamic updates (WAI-ARIA aria-live). 'polite' waits for user pause; 'assertive' interrupts immediately for alerts.",
          enum: ["off", "polite", "assertive"],
          default: "off",
        },
        hidden: {
          $ref: "#/$defs/DynamicBoolean",
          description:
            "Hides the element and its children from assistive technologies when true. Default is false.",
        },
      },
      additionalProperties: false,
    },
    Extensions: {
      type: "object",
      description:
        "Optional extension metadata. Keys MUST be Unicode identifiers (UAX #31). Keys starting with 'a2ui_' are reserved for official extensions.",
      patternProperties: {
        "^[\\p{XID_Start}_][\\p{XID_Continue}]*$": {},
      },
      additionalProperties: false,
    },
    ComponentCommon: {
      type: "object",
      properties: {
        id: {
          $ref: "#/$defs/ComponentId",
        },
        "@catalogId": {
          type: "string",
          description:
            "The catalog ID for this component, overriding any surface-level default catalogId.",
        },
        "@accessibility": {
          $ref: "#/$defs/AccessibilityAttributes",
        },
        "@metadata": {
          type: "object",
          description: "Optional component-level metadata for vendor extensions.",
          properties: {
            extensions: {
              $ref: "#/$defs/Extensions",
            },
          },
          additionalProperties: false,
        },
      },
      required: ["id"],
    },
    Child: {
      $ref: "#/$defs/ComponentId",
      description: "A reference to a single child component ID.",
    },
    ChildList: {
      oneOf: [
        {
          type: "array",
          description: "A static list of child component IDs.",
          items: {
            $ref: "#/$defs/ComponentId",
          },
        },
        {
          type: "object",
          description:
            "A template for generating a dynamic list of children from a data model list. The `componentId` is the component to use as a template.",
          properties: {
            componentId: {
              $ref: "#/$defs/ComponentId",
            },
            path: {
              type: "string",
              description:
                "The path to the list of component property objects in the data model.",
            },
          },
          required: ["componentId", "path"],
          additionalProperties: false,
        },
      ],
    },
    DataBinding: {
      type: "object",
      properties: {
        "@path": {
          type: "string",
          description: "A JSON Pointer path to a value in the data model.",
        },
      },
      required: ["@path"],
      additionalProperties: false,
    },
    DynamicValue: {
      description:
        "A value that can be a literal, a path, or a function call returning any type.",
      oneOf: [
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "array" },
        {
          type: "object",
          propertyNames: {
            not: {
              pattern: "^@([^@]|$)",
            },
          },
          not: {
            anyOf: [{ required: ["@path"] }, { required: ["@call"] }],
          },
        },
        { $ref: "#/$defs/DataBinding" },
        { $ref: "#/$defs/FunctionCall" },
      ],
    },
    DynamicString: {
      description: "Represents a string",
      oneOf: [
        { type: "string" },
        { $ref: "#/$defs/DataBinding" },
        { $ref: "#/$defs/FunctionCall" },
      ],
    },
    DynamicNumber: {
      description:
        "Represents a value that can be either a literal number, a path to a number in the data model, or a function call returning a number.",
      oneOf: [
        { type: "number" },
        { $ref: "#/$defs/DataBinding" },
        { $ref: "#/$defs/FunctionCall" },
      ],
    },
    DynamicBoolean: {
      description:
        "A boolean value that can be a literal, a path, or a function call returning a boolean or a validation result object (coerced to its 'valid' boolean).",
      oneOf: [
        { type: "boolean" },
        { $ref: "#/$defs/DataBinding" },
        { $ref: "#/$defs/FunctionCall" },
      ],
    },
    DynamicStringList: {
      description:
        "Represents a value that can be either a literal array of strings, a path to a string array in the data model, or a function call returning a string array.",
      oneOf: [
        {
          type: "array",
          items: { type: "string" },
        },
        { $ref: "#/$defs/DataBinding" },
        { $ref: "#/$defs/FunctionCall" },
      ],
    },
    FunctionCommon: {
      type: "object",
      description:
        "Baseline envelope properties common to all function calls. Function-specific argument schemas ('args') are defined individually by each function in the active catalog.",
      properties: {
        "@call": {
          type: "string",
          description: "The name of the function to call.",
        },
        catalogId: {
          type: "string",
          description:
            "The catalog ID for this function, overriding any surface-level default catalogId.",
        },
      },
      required: ["@call"],
    },
    IndexSystemFunction: {
      type: "object",
      description:
        "Returns the 0-based index of the current item when rendering a dynamic list from a template. This function MUST ONLY be available when evaluating template items within a list context.",
      properties: {
        "@call": { const: "@index" },
        args: {
          type: "object",
          properties: {
            offset: {
              $ref: "#/$defs/DynamicNumber",
              description:
                "Optional. An offset to add to the 0-based index (e.g., 1 for 1-based indexing). Defaults to 0.",
              default: 0,
            },
          },
          unevaluatedProperties: false,
        },
      },
      required: ["@call"],
      unevaluatedProperties: false,
      returnType: "number",
    },
    FunctionCall: {
      type: "object",
      description:
        "Invokes a named function, combining common function properties with the catalog function definition.",
      allOf: [
        { $ref: "#/$defs/FunctionCommon" },
        {
          oneOf: [
            { $ref: "catalog.json#/$defs/anyFunction" },
            { $ref: "#/$defs/IndexSystemFunction" },
          ],
        },
      ],
      unevaluatedProperties: false,
    },
    CheckRule: {
      type: "object",
      description:
        "A single validation check rule applied to an input component. The condition function or path evaluates to a structured validation result object or a boolean (which is coerced to a validation result object).",
      properties: {
        condition: {
          description:
            "Path or function call evaluating to a structured validation result object or a boolean.",
          oneOf: [
            { $ref: "#/$defs/DataBinding" },
            { $ref: "#/$defs/FunctionCall" },
          ],
        },
        message: {
          type: "string",
          description: "Optional fallback error message.",
        },
      },
      required: ["condition"],
      additionalProperties: false,
    },
    Checkable: {
      type: "object",
      description: "Properties for components that support renderer-side checks.",
      properties: {
        "@checks": {
          type: "array",
          description: "A list of validation check rules to perform on the component.",
          items: { $ref: "#/$defs/CheckRule" },
        },
      },
    },
    Action: {
      description:
        "Defines an interaction handler that can either trigger an agent-side event or execute a local renderer-side function.",
      oneOf: [
        {
          type: "object",
          description: "Triggers an agent-side event.",
          properties: {
            event: {
              type: "object",
              description: "The event to dispatch to the agent.",
              properties: {
                name: {
                  type: "string",
                  description: "The name of the action to be dispatched to the agent.",
                },
                userMessage: {
                  $ref: "#/$defs/DynamicString",
                  description:
                    "An optional human-readable message describing the action performed by the user, resolved by the renderer and included in the outbound action message.",
                },
                context: {
                  type: "object",
                  description:
                    "A JSON object containing the key-value pairs for the action context. Values can be literals or paths. Use literal values unless the value must be dynamically bound to the data model. Do NOT use paths for static IDs.",
                  additionalProperties: {
                    $ref: "#/$defs/DynamicValue",
                  },
                },
              },
              required: ["name"],
              additionalProperties: false,
            },
          },
          required: ["event"],
          additionalProperties: false,
        },
        {
          type: "object",
          description: "Executes a renderer or agent-side function.",
          properties: {
            functionCall: {
              $ref: "#/$defs/FunctionCall",
            },
          },
          required: ["functionCall"],
          additionalProperties: false,
        },
      ],
    },
    Surface: {
      title: "Surface Container Component",
      description:
        "The reserved canonical container component representing an A2UI surface. The Surface component is immutable and always has 'child': 'root'.",
      type: "object",
      allowedParents: [],
      properties: {
        component: { const: "Surface" },
        child: { const: "root" },
      },
      additionalProperties: false,
    },
    FunctionResponse: {
      type: "object",
      description:
        "The return response matching a callAgentFunction or callRendererFunction invocation.",
      properties: {
        functionCallId: {
          $ref: "#/$defs/CallId",
          description: "The unique ID matching the initiating function call.",
        },
        value: {
          description: "The return value of the function.",
        },
        error: {
          type: "object",
          description:
            "An error object indicating failure of the function execution.",
          properties: {
            code: { type: "string" },
            message: { type: "string" },
          },
          required: ["code", "message"],
          additionalProperties: false,
        },
      },
      required: ["functionCallId"],
      oneOf: [{ required: ["value"] }, { required: ["error"] }],
      additionalProperties: false,
    },
  },
};

const AGENT_TO_RENDERER_V1_SCHEMA: JsonObject = {
  $schema: JSON_SCHEMA_DRAFT_2020_12,
  $id: AGENT_TO_RENDERER_V1_ID,
  title: "A2UI Message Schema",
  description:
    "Describes a JSON payload for an A2UI message, which is used to dynamically construct and update user interfaces.",
  type: "object",
  oneOf: [
    { $ref: "#/$defs/CreateSurfaceMessage" },
    { $ref: "#/$defs/UpdateComponentsMessage" },
    { $ref: "#/$defs/UpdateDataModelMessage" },
    { $ref: "#/$defs/DeleteSurfaceMessage" },
    { $ref: "#/$defs/CallRendererFunctionMessage" },
    { $ref: "#/$defs/AgentFunctionResponseMessage" },
  ],
  $defs: {
    CreateSurfaceMessage: {
      type: "object",
      properties: {
        version: { const: "1.0" },
        createSurface: {
          type: "object",
          description:
            "Signals the renderer to create a new surface and begin rendering it. Creating a surface implicitly instantiates the canonical 'Surface' container component ('common_types.json#/$defs/Surface') with 'child': 'root'. It is an error to try to create a surface with an existing ID without first deleting it; surfaceId MUST be globally unique for the renderer's lifetime. The component tree and initial data model may be provided inline via 'components' and 'dataModel', or sent later in 'updateComponents' and/or 'updateDataModel' messages for the same surfaceId.",
          properties: {
            surfaceId: {
              type: "string",
              description:
                "The unique identifier for the UI surface to be rendered. It must be globally unique for the renderer's lifetime.",
            },
            catalogId: {
              type: "string",
              description:
                "A string that uniquely identifies the default catalog for this surface. It is recommended to prefix this with an internet domain that you own, to avoid conflicts e.g. 'mycompany.com:somecatalog'. Components that do not explicitly specify @catalogId and function calls that do not explicitly specify catalogId will use this surface-level default catalogId.",
            },
            sendDataModel: {
              type: "boolean",
              description:
                "If true, the renderer will send the full data model of this surface in the metadata of every A2A message sent to the agent that created the surface. Defaults to false.",
            },
            components: { $ref: "#/$defs/ComponentsList" },
            dataModel: {
              type: "object",
              description: "The initial root data model object for the surface.",
              additionalProperties: true,
            },
            metadata: {
              type: "object",
              description: "Optional surface-level metadata.",
              properties: {
                extensions: { $ref: "common_types.json#/$defs/Extensions" },
              },
              additionalProperties: false,
            },
          },
          required: ["surfaceId"],
          additionalProperties: false,
        },
      },
      required: ["createSurface", "version"],
      additionalProperties: false,
    },
    Component: {
      description:
        "A UI component for the surface, combining baseline envelope properties with the catalog component definition.",
      allOf: [
        { $ref: "common_types.json#/$defs/ComponentCommon" },
        { $ref: "catalog.json#/$defs/anyComponent" },
        {
          type: "object",
          properties: {
            component: {
              not: { const: "Surface" },
            },
          },
        },
      ],
      unevaluatedProperties: false,
    },
    ComponentsList: {
      type: "array",
      description: "A list containing UI components for the surface.",
      minItems: 1,
      items: { $ref: "#/$defs/Component" },
    },
    UpdateComponentsMessage: {
      type: "object",
      properties: {
        version: { const: "1.0" },
        updateComponents: {
          type: "object",
          description:
            "Updates a surface with a new set of components. This message can be sent multiple times to update the component tree of an existing surface. One of the components in one of the components lists MUST have an 'id' of 'root' to serve as the root of the component tree. The createSurface message MUST have been previously sent for this surfaceId.",
          properties: {
            surfaceId: {
              type: "string",
              description:
                "The unique identifier for the UI surface to be updated. It must be globally unique for the renderer's lifetime.",
            },
            components: { $ref: "#/$defs/ComponentsList" },
          },
          required: ["surfaceId", "components"],
          additionalProperties: false,
        },
      },
      required: ["updateComponents", "version"],
      additionalProperties: false,
    },
    UpdateDataModelMessage: {
      type: "object",
      properties: {
        version: { const: "1.0" },
        updateDataModel: {
          type: "object",
          description:
            "Updates the data model for an existing surface. This message can be sent multiple times to update the data model. The createSurface message MUST have been previously sent for this surfaceId.",
          properties: {
            surfaceId: {
              type: "string",
              description:
                "The unique identifier for the UI surface this data model update applies to. It must be globally unique for the renderer's lifetime.",
            },
            path: {
              type: "string",
              description:
                "An optional path to a location within the data model (e.g., '/user/name'). If omitted, or set to '/', refers to the entire data model.",
            },
            value: {
              description:
                "The data to be updated in the data model. To delete the key/value at 'path', set 'value' explicitly to null.",
            },
          },
          required: ["surfaceId", "value"],
          additionalProperties: false,
        },
      },
      required: ["updateDataModel", "version"],
      additionalProperties: false,
    },
    DeleteSurfaceMessage: {
      type: "object",
      properties: {
        version: { const: "1.0" },
        deleteSurface: {
          type: "object",
          description:
            "Signals the renderer to delete the surface identified by 'surfaceId'. The createSurface message MUST have been previously sent for this surfaceId.",
          properties: {
            surfaceId: {
              type: "string",
              description:
                "The unique identifier for the UI surface to be deleted. It must be globally unique for the renderer's lifetime.",
            },
          },
          required: ["surfaceId"],
          additionalProperties: false,
        },
      },
      required: ["deleteSurface", "version"],
      additionalProperties: false,
    },
    CallRendererFunctionMessage: {
      type: "object",
      properties: {
        version: { const: "1.0" },
        callRendererFunction: {
          type: "object",
          description:
            "Signals the renderer to execute a function locally on behalf of the agent.",
          properties: {
            surfaceId: {
              type: "string",
              description:
                "Optional ID of the surface whose data model provides the evaluation context for this call. If omitted, the function executes in a surface-independent root context with an empty data model.",
            },
            functionCallId: {
              $ref: "common_types.json#/$defs/CallId",
              description:
                "Unique ID for this instance of the function call. The renderer MUST copy this ID into the return response.",
            },
            callFunction: {
              allOf: [
                { $ref: "common_types.json#/$defs/FunctionCall" },
                { required: ["catalogId"] },
              ],
            },
          },
          required: ["functionCallId", "callFunction"],
          additionalProperties: false,
        },
      },
      required: ["callRendererFunction", "version"],
      additionalProperties: false,
    },
    AgentFunctionResponseMessage: {
      type: "object",
      properties: {
        version: { const: "1.0" },
        agentFunctionResponse: {
          $ref: "common_types.json#/$defs/FunctionResponse",
        },
      },
      required: ["agentFunctionResponse", "version"],
      additionalProperties: false,
    },
  },
};

const BASIC_CATALOG_V1_INSTRUCTIONS =
  `For layout, use the Row and Column components to organize other components.

## Catalog Guidelines

1. String Concatenation & Formatting: A2UI does not support binary operators like '+' or formatting symbols. To concatenate strings or dynamically inject data bindings into text, you must use the catalog function \`formatString(value)\` where the value string contains placeholders formatted as \`\${expression}\`:
   formatString("Hello \${/user/name}")

2. Strict Hierarchy: You must strictly adhere to the requested component nesting and hierarchy. If the prompt specifies that a component is 'inside' or 'contained in' another component, you MUST place it as a child of that specific component, not as a sibling or in a different container.

3. Validation Checks: When components support validation checks, specify any custom error messages directly as the 'message' inside the check. Do NOT create separate text-display components to display validation errors.

## Examples

Example 1: Dynamic text form
\`\`\`json
[
  {
    "version": "1.0",
    "createSurface": {
      "surfaceId": "main",
      "catalogId": "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
      "components": [
        {
          "id": "root",
          "component": "Column",
          "children": ["repField", "valueField"]
        },
        {
          "id": "repField",
          "component": "TextField",
          "label": "Representative",
          "value": {"@path": "/form/rep"},
          "placeholder": "Enter name"
        },
        {
          "id": "valueField",
          "component": "TextField",
          "label": "Deal Value",
          "value": {"@path": "/form/value"},
          "placeholder": "0.00",
          "variant": "number",
          "@checks": [
            {
              "condition": {
                "@call": "required",
                "args": {"value": {"@path": "/form/value"}}
              },
              "message": "Deal value is required."
            }
          ]
        }
      ],
      "dataModel": {
        "form": {
          "rep": "John Doe",
          "value": 1500.00
        }
      }
    }
  }
]
\`\`\`

Example 2: Dynamic list with templates
\`\`\`json
[
  {
    "version": "1.0",
    "createSurface": {
      "surfaceId": "main",
      "catalogId": "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json",
      "components": [
        {
          "id": "root",
          "component": "Card",
          "child": "breedList"
        },
        {
          "id": "breedList",
          "component": "List",
          "children": {
            "path": "/breeds",
            "componentId": "breedTemplate"
          },
          "direction": "horizontal"
        },
        {
          "id": "breedTemplate",
          "component": "Image",
          "url": {"@path": "url"}
        }
      ],
      "dataModel": {
        "breeds": [
          {
            "url": "https://example.com/poodle.jpg"
          },
          {
            "url": "https://example.com/lab.jpg"
          }
        ]
      }
    }
  }
]
\`\`\``;

const BASIC_ICON_NAMES: readonly string[] = [
  "accountCircle",
  "add",
  "arrowBack",
  "arrowForward",
  "attachFile",
  "calendarToday",
  "call",
  "camera",
  "check",
  "close",
  "delete",
  "download",
  "edit",
  "event",
  "error",
  "fastForward",
  "favorite",
  "favoriteOff",
  "folder",
  "help",
  "home",
  "info",
  "locationOn",
  "lock",
  "lockOpen",
  "mail",
  "menu",
  "moreVert",
  "moreHoriz",
  "notificationsOff",
  "notifications",
  "pause",
  "payment",
  "person",
  "phone",
  "photo",
  "play",
  "print",
  "refresh",
  "rewind",
  "search",
  "send",
  "settings",
  "share",
  "shoppingCart",
  "skipNext",
  "skipPrevious",
  "star",
  "starHalf",
  "starOff",
  "stop",
  "upload",
  "visibility",
  "visibilityOff",
  "volumeDown",
  "volumeMute",
  "volumeOff",
  "volumeUp",
  "warning",
];

function commonRef(name: string, description?: string): JsonObject {
  const out: JsonObject = { $ref: `common_types.json#/$defs/${name}` };
  if (description !== undefined) {
    out["description"] = description;
  }
  return out;
}

function weightRef(): JsonObject {
  return { $ref: "#/$defs/Weight" };
}

function isoDateTimeBound(description: string): JsonObject {
  return {
    allOf: [
      commonRef("DynamicString"),
      {
        if: { type: "string" },
        then: {
          oneOf: [
            { format: "date" },
            { format: "time" },
            { format: "date-time" },
          ],
        },
      },
    ],
    description,
  };
}

function checkableComponent(
  name: string,
  properties: JsonObject,
  required: string[],
  description?: string,
): JsonObject {
  const out: JsonObject = { type: "object" };
  if (description !== undefined) {
    out["description"] = description;
  }
  out["allOf"] = [
    commonRef("Checkable"),
    {
      type: "object",
      properties: {
        component: { const: name },
        ...properties,
        weight: weightRef(),
      },
      required: ["component", ...required],
    },
  ];
  return out;
}

function basicFunctionDef(
  name: string,
  description: string,
  returnType: string,
  argsSchema: JsonObject,
  extra?: JsonObject,
): JsonObject {
  return {
    type: "object",
    description,
    returnType,
    ...(extra ?? {}),
    properties: {
      "@call": { const: name },
      args: argsSchema,
    },
    required: ["@call", "args"],
  };
}

const BASIC_CATALOG_V1_COMPONENT_ORDER = [
  "Text",
  "Image",
  "Icon",
  "Video",
  "AudioPlayer",
  "Row",
  "Column",
  "List",
  "Card",
  "Tabs",
  "Modal",
  "Divider",
  "Button",
  "TextField",
  "CheckBox",
  "ChoicePicker",
  "Slider",
  "DateTimeInput",
] as const;

const BASIC_CATALOG_V1_FUNCTION_ORDER = [
  "required",
  "regex",
  "length",
  "numeric",
  "email",
  "formatString",
  "formatNumber",
  "formatCurrency",
  "formatDate",
  "pluralize",
  "openUrl",
  "and",
  "or",
  "not",
] as const;

const BASIC_CATALOG_V1_DOCUMENT: JsonObject = {
  $schema: JSON_SCHEMA_DRAFT_2020_12,
  $id: BASIC_CATALOG_V1_ID,
  protocolVersion: "1.0",
  title: "A2UI Basic Catalog",
  description: "Unified catalog of basic A2UI components and functions.",
  catalogId: BASIC_CATALOG_V1_ID,
  instructions: BASIC_CATALOG_V1_INSTRUCTIONS,
  components: {
    Text: {
      type: "object",
      properties: {
        component: { const: "Text" },
        text: commonRef(
          "DynamicString",
          "The text content to display. While simple Markdown formatting is supported (i.e. without HTML, images, or links), utilizing dedicated UI components is generally preferred for a richer and more structured presentation.",
        ),
        variant: {
          type: "string",
          description: "A hint for the base text style.",
          enum: ["caption", "body"],
          default: "body",
        },
        weight: weightRef(),
      },
      required: ["component", "text"],
    },
    Image: {
      type: "object",
      properties: {
        component: { const: "Image" },
        url: commonRef("DynamicString", "The URL of the image to display."),
        description: commonRef("DynamicString", "Accessibility text for the image."),
        fit: {
          type: "string",
          description:
            "Specifies how the image should be resized to fit its container. This corresponds to the CSS 'object-fit' property.",
          enum: ["contain", "cover", "fill", "none", "scaleDown"],
          default: "fill",
        },
        variant: {
          type: "string",
          description: "A hint for the image size and style.",
          enum: [
            "icon",
            "avatar",
            "smallFeature",
            "mediumFeature",
            "largeFeature",
            "header",
          ],
          default: "mediumFeature",
        },
        weight: weightRef(),
      },
      required: ["component", "url"],
    },
    Icon: {
      type: "object",
      properties: {
        component: { const: "Icon" },
        name: {
          description: "The name of the icon to display.",
          oneOf: [
            { type: "string", enum: [...BASIC_ICON_NAMES] },
            {
              type: "object",
              properties: {
                svgPath: commonRef("DynamicString"),
              },
              required: ["svgPath"],
              additionalProperties: false,
            },
            commonRef("DataBinding"),
          ],
        },
        weight: weightRef(),
      },
      required: ["component", "name"],
    },
    Video: {
      type: "object",
      properties: {
        component: { const: "Video" },
        url: commonRef("DynamicString", "The URL of the video to display."),
        posterUrl: commonRef(
          "DynamicString",
          "The URL of the poster image to display before the video plays.",
        ),
        weight: weightRef(),
      },
      required: ["component", "url"],
    },
    AudioPlayer: {
      type: "object",
      properties: {
        component: { const: "AudioPlayer" },
        url: commonRef("DynamicString", "The URL of the audio to be played."),
        description: commonRef(
          "DynamicString",
          "A description of the audio, such as a title or summary.",
        ),
        weight: weightRef(),
      },
      required: ["component", "url"],
    },
    Row: {
      type: "object",
      description:
        "A layout component that arranges its children horizontally. To create a grid layout, nest Columns within this Row.",
      properties: {
        component: { const: "Row" },
        children: commonRef(
          "ChildList",
          "Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.",
        ),
        justify: {
          type: "string",
          description:
            "Defines the arrangement of children along the main axis (horizontally). Use 'spaceBetween' to push items to the edges, or 'start'/'end'/'center' to pack them together.",
          enum: [
            "center",
            "end",
            "spaceAround",
            "spaceBetween",
            "spaceEvenly",
            "start",
            "stretch",
          ],
          default: "start",
        },
        align: {
          type: "string",
          description:
            "Defines the alignment of children along the cross axis (vertically). This is similar to the CSS 'align-items' property, but uses camelCase values (e.g., 'start').",
          enum: ["start", "center", "end", "stretch"],
          default: "stretch",
        },
        weight: weightRef(),
      },
      required: ["component", "children"],
    },
    Column: {
      type: "object",
      description:
        "A layout component that arranges its children vertically. To create a grid layout, nest Rows within this Column.",
      properties: {
        component: { const: "Column" },
        children: commonRef(
          "ChildList",
          "Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.",
        ),
        justify: {
          type: "string",
          description:
            "Defines the arrangement of children along the main axis (vertically). Use 'spaceBetween' to push items to the edges (e.g. header at top, footer at bottom), or 'start'/'end'/'center' to pack them together.",
          enum: [
            "start",
            "center",
            "end",
            "spaceBetween",
            "spaceAround",
            "spaceEvenly",
            "stretch",
          ],
          default: "start",
        },
        align: {
          type: "string",
          description:
            "Defines the alignment of children along the cross axis (horizontally). This is similar to the CSS 'align-items' property.",
          enum: ["center", "end", "start", "stretch"],
          default: "stretch",
        },
        weight: weightRef(),
      },
      required: ["component", "children"],
    },
    List: {
      type: "object",
      properties: {
        component: { const: "List" },
        children: commonRef(
          "ChildList",
          "Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list.",
        ),
        direction: {
          type: "string",
          description: "The direction in which the list items are laid out.",
          enum: ["vertical", "horizontal"],
          default: "vertical",
        },
        align: {
          type: "string",
          description: "Defines the alignment of children along the cross axis.",
          enum: ["start", "center", "end", "stretch"],
          default: "stretch",
        },
        weight: weightRef(),
      },
      required: ["component", "children"],
    },
    Card: {
      type: "object",
      properties: {
        component: { const: "Card" },
        child: commonRef(
          "Child",
          "The ID of the single child component to be rendered inside the card. To display multiple elements, you MUST wrap them in a layout component (like Column or Row) and pass that container's ID here. Do NOT pass multiple IDs or a non-existent ID.",
        ),
        weight: weightRef(),
      },
      required: ["component", "child"],
    },
    Tabs: {
      type: "object",
      properties: {
        component: { const: "Tabs" },
        tabs: {
          type: "array",
          description:
            "An array of objects, where each object defines a tab with a title and a child component.",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              title: commonRef("DynamicString", "The tab title."),
              child: commonRef("Child", "The ID of the child component."),
            },
            required: ["title", "child"],
            additionalProperties: false,
          },
        },
        weight: weightRef(),
      },
      required: ["component", "tabs"],
    },
    Modal: {
      type: "object",
      properties: {
        component: { const: "Modal" },
        trigger: commonRef(
          "Child",
          "The ID of the component that opens the modal when interacted with (e.g., a button).",
        ),
        content: commonRef(
          "Child",
          "The ID of the component to be displayed inside the modal.",
        ),
        weight: weightRef(),
      },
      required: ["component", "trigger", "content"],
    },
    Divider: {
      type: "object",
      properties: {
        component: { const: "Divider" },
        axis: {
          type: "string",
          description: "The orientation of the divider.",
          enum: ["horizontal", "vertical"],
          default: "horizontal",
        },
        weight: weightRef(),
      },
      required: ["component"],
    },
    Button: checkableComponent(
      "Button",
      {
        child: commonRef(
          "Child",
          "The ID of the child component. Use a 'Text' component for a labeled button. Only use an 'Icon' if the requirements explicitly ask for an icon-only button.",
        ),
        variant: {
          type: "string",
          description:
            "A hint for the button style. If omitted, a default button style is used. 'primary' indicates this is the main call-to-action button. 'borderless' means the button has no visual border or background, making its child content appear like a clickable link.",
          enum: ["default", "primary", "borderless"],
          default: "default",
        },
        action: commonRef("Action"),
      },
      ["child", "action"],
    ),
    TextField: checkableComponent(
      "TextField",
      {
        label: commonRef("DynamicString", "The text label for the input field."),
        value: commonRef("DynamicString", "The value of the text field."),
        placeholder: commonRef(
          "DynamicString",
          "The placeholder text for the input field.",
        ),
        variant: {
          type: "string",
          description: "The type of input field to display.",
          enum: ["longText", "number", "shortText", "obscured"],
          default: "shortText",
        },
      },
      ["label", "value"],
    ),
    CheckBox: checkableComponent(
      "CheckBox",
      {
        label: commonRef(
          "DynamicString",
          "The text to display next to the checkbox.",
        ),
        value: commonRef(
          "DynamicBoolean",
          "The current state of the checkbox (true for checked, false for unchecked).",
        ),
      },
      ["label", "value"],
    ),
    ChoicePicker: checkableComponent(
      "ChoicePicker",
      {
        label: commonRef("DynamicString", "The label for the group of options."),
        variant: {
          type: "string",
          description:
            "A hint for how the choice picker should be displayed and behave.",
          enum: ["multipleSelection", "mutuallyExclusive"],
          default: "mutuallyExclusive",
        },
        options: {
          type: "array",
          description: "The list of available options to choose from.",
          items: {
            type: "object",
            properties: {
              label: commonRef(
                "DynamicString",
                "The text to display for this option.",
              ),
              value: {
                type: "string",
                description: "The stable value associated with this option.",
              },
            },
            required: ["label", "value"],
            additionalProperties: false,
          },
        },
        value: commonRef(
          "DynamicStringList",
          "The list of currently selected values. This should be bound to a string array in the data model.",
        ),
        displayStyle: {
          type: "string",
          description: "The display style of the component.",
          enum: ["checkbox", "chips"],
          default: "checkbox",
        },
        filterable: {
          type: "boolean",
          description:
            "If true, displays a search input to filter the options.",
          default: false,
        },
      },
      ["options", "value"],
      "A component that allows selecting one or more options from a list.",
    ),
    Slider: checkableComponent(
      "Slider",
      {
        label: commonRef("DynamicString", "The label for the slider."),
        min: {
          type: "number",
          description: "The minimum value of the slider.",
          default: 0,
        },
        max: {
          type: "number",
          description: "The maximum value of the slider.",
        },
        value: commonRef("DynamicNumber", "The current value of the slider."),
        steps: {
          type: "integer",
          minimum: 1,
          description:
            "The number of discrete divisions in the slider range. If specified, the slider will snap to discrete values.",
        },
      },
      ["value", "max"],
    ),
    DateTimeInput: checkableComponent(
      "DateTimeInput",
      {
        value: commonRef(
          "DynamicString",
          "The selected date and/or time value in ISO 8601 format. If not yet set, initialize with an empty string.",
        ),
        enableDate: {
          type: "boolean",
          description: "If true, allows the user to select a date.",
          default: false,
        },
        enableTime: {
          type: "boolean",
          description: "If true, allows the user to select a time.",
          default: false,
        },
        min: isoDateTimeBound(
          "The minimum allowed date/time in ISO 8601 format.",
        ),
        max: isoDateTimeBound(
          "The maximum allowed date/time in ISO 8601 format.",
        ),
        label: commonRef("DynamicString", "The text label for the input field."),
      },
      ["value"],
    ),
  },
  functions: {
    required: basicFunctionDef(
      "required",
      "Checks that the value is not null, undefined, or empty.",
      "validationResult",
      {
        type: "object",
        properties: {
          value: { description: "The value to check." },
        },
        required: ["value"],
        unevaluatedProperties: false,
      },
    ),
    regex: basicFunctionDef(
      "regex",
      "Checks that the value matches a regular expression string.",
      "validationResult",
      {
        type: "object",
        properties: {
          value: commonRef("DynamicString"),
          pattern: {
            type: "string",
            description:
              "The regular expression to search for in the value. Uses the A2UI regex dialect: a portable subset of ECMAScript pattern syntax in Unicode mode with no flags. Matching is case-sensitive, '.' excludes line terminators, and '^' and '$' match only at the ends of the value. Backreferences, lookbehind, named groups and '\\p{...}' are not allowed. Patterns longer than 256 code points or that could backtrack catastrophically are rejected.",
          },
        },
        required: ["value", "pattern"],
        unevaluatedProperties: false,
      },
    ),
    length: basicFunctionDef(
      "length",
      "Checks string length constraints.",
      "validationResult",
      {
        type: "object",
        properties: {
          value: commonRef("DynamicString"),
          min: {
            type: "integer",
            minimum: 0,
            description: "The minimum allowed length.",
          },
          max: {
            type: "integer",
            minimum: 0,
            description: "The maximum allowed length.",
          },
        },
        required: ["value"],
        anyOf: [{ required: ["min"] }, { required: ["max"] }],
        unevaluatedProperties: false,
      },
    ),
    numeric: basicFunctionDef(
      "numeric",
      "Checks numeric range constraints.",
      "validationResult",
      {
        type: "object",
        properties: {
          value: commonRef("DynamicNumber"),
          min: {
            type: "number",
            description: "The minimum allowed value.",
          },
          max: {
            type: "number",
            description: "The maximum allowed value.",
          },
        },
        required: ["value"],
        anyOf: [{ required: ["min"] }, { required: ["max"] }],
        unevaluatedProperties: false,
      },
    ),
    email: basicFunctionDef(
      "email",
      "Checks that the value is a valid email address.",
      "validationResult",
      {
        type: "object",
        properties: {
          value: commonRef("DynamicString"),
        },
        required: ["value"],
        unevaluatedProperties: false,
      },
    ),
    formatString: basicFunctionDef(
      "formatString",
      "Performs string interpolation of data model values and other functions in the catalog functions list and returns the resulting string. The value string can contain interpolated expressions in the `${expression}` format. Supported expression types include: JSON Pointer paths to the data model (e.g., `${/absolute/path}` or `${relative/path}`), and renderer-side function calls (e.g., `${now()}`). Function arguments must be named (e.g., `${formatDate(value:${/currentDate}, format:'MM-dd')}`). To include a literal `${` sequence, escape it as `\\${`.",
      "string",
      {
        type: "object",
        properties: {
          value: commonRef("DynamicString"),
        },
        required: ["value"],
        unevaluatedProperties: false,
      },
    ),
    formatNumber: basicFunctionDef(
      "formatNumber",
      "Formats a number with the specified grouping and decimal precision.",
      "string",
      {
        type: "object",
        properties: {
          value: commonRef("DynamicNumber", "The number to format."),
          decimals: commonRef(
            "DynamicNumber",
            "Optional. The number of decimal places to show. Defaults to 0 or 2 depending on locale.",
          ),
          grouping: commonRef(
            "DynamicBoolean",
            "Optional. If true, uses locale-specific grouping separators (e.g. '1,000'). If false, returns raw digits (e.g. '1000'). Defaults to true.",
          ),
        },
        required: ["value"],
        unevaluatedProperties: false,
      },
    ),
    formatCurrency: basicFunctionDef(
      "formatCurrency",
      "Formats a number as a currency string.",
      "string",
      {
        type: "object",
        properties: {
          value: commonRef("DynamicNumber", "The monetary amount."),
          currency: commonRef(
            "DynamicString",
            "The ISO 4217 currency code (e.g., 'USD', 'EUR').",
          ),
          decimals: commonRef(
            "DynamicNumber",
            "Optional. The number of decimal places to show. Defaults to 0 or 2 depending on locale.",
          ),
          grouping: commonRef(
            "DynamicBoolean",
            "Optional. If true, uses locale-specific grouping separators (e.g. '1,000'). If false, returns raw digits (e.g. '1000'). Defaults to true.",
          ),
        },
        required: ["currency", "value"],
        unevaluatedProperties: false,
      },
    ),
    formatDate: basicFunctionDef(
      "formatDate",
      "Formats a timestamp into a string using a pattern.",
      "string",
      {
        type: "object",
        properties: {
          value: commonRef("DynamicValue", "The date to format."),
          format: commonRef(
            "DynamicString",
            "A Unicode TR35 date pattern string.\n\nToken Reference:\n- Year: 'yy' (26), 'yyyy' (2026)\n- Month: 'M' (1), 'MM' (01), 'MMM' (Jan), 'MMMM' (January)\n- Day: 'd' (1), 'dd' (01), 'E' (Tue), 'EEEE' (Tuesday)\n- Hour (12h): 'h' (1-12), 'hh' (01-12) - requires 'a' for AM/PM\n- Hour (24h): 'H' (0-23), 'HH' (00-23) - Military Time\n- Minute: 'mm' (00-59)\n- Second: 'ss' (00-59)\n- Period: 'a' (AM/PM)\n\nExamples:\n- 'MMM dd, yyyy' -> 'Jan 16, 2026'\n- 'HH:mm' -> '14:30' (Military)\n- 'h:mm a' -> '2:30 PM'\n- 'EEEE, d MMMM' -> 'Friday, 16 January'",
          ),
        },
        required: ["format", "value"],
        unevaluatedProperties: false,
      },
    ),
    pluralize: basicFunctionDef(
      "pluralize",
      "Returns a localized string based on the Common Locale Data Repository (CLDR) plural category of the count (zero, one, two, few, many, other). Requires an 'other' fallback. For English, just use 'one' and 'other'.",
      "string",
      {
        type: "object",
        properties: {
          value: commonRef(
            "DynamicNumber",
            "The numeric value used to determine the plural category.",
          ),
          zero: commonRef(
            "DynamicString",
            "String for the 'zero' category (e.g., 0 items).",
          ),
          one: commonRef(
            "DynamicString",
            "String for the 'one' category (e.g., 1 item).",
          ),
          two: commonRef(
            "DynamicString",
            "String for the 'two' category (used in Arabic, Welsh, etc.).",
          ),
          few: commonRef(
            "DynamicString",
            "String for the 'few' category (e.g., small groups in Slavic languages).",
          ),
          many: commonRef(
            "DynamicString",
            "String for the 'many' category (e.g., large groups in various languages).",
          ),
          other: commonRef(
            "DynamicString",
            "The default/fallback string (used for general plural cases).",
          ),
        },
        required: ["value", "other"],
        unevaluatedProperties: false,
      },
    ),
    openUrl: basicFunctionDef(
      "openUrl",
      "Opens the specified URL in a browser or handler (requires user activation). This function has no return value.",
      "void",
      {
        type: "object",
        properties: {
          url: {
            description: "The URL to open.",
            oneOf: [
              { type: "string", format: "uri" },
              commonRef("DataBinding"),
              commonRef("FunctionCall"),
            ],
          },
        },
        required: ["url"],
        unevaluatedProperties: false,
      },
      { requiresUserActivation: true },
    ),
    and: basicFunctionDef(
      "and",
      "Performs a logical AND operation on a list of boolean values.",
      "boolean",
      {
        type: "object",
        properties: {
          values: {
            type: "array",
            description: "The list of boolean values to evaluate.",
            items: commonRef("DynamicBoolean"),
            minItems: 2,
          },
        },
        required: ["values"],
        unevaluatedProperties: false,
      },
    ),
    or: basicFunctionDef(
      "or",
      "Performs a logical OR operation on a list of boolean values.",
      "boolean",
      {
        type: "object",
        properties: {
          values: {
            type: "array",
            description: "The list of boolean values to evaluate.",
            items: commonRef("DynamicBoolean"),
            minItems: 2,
          },
        },
        required: ["values"],
        unevaluatedProperties: false,
      },
    ),
    not: basicFunctionDef(
      "not",
      "Performs a logical NOT operation on a boolean value.",
      "boolean",
      {
        type: "object",
        properties: {
          value: commonRef("DynamicBoolean", "The boolean value to negate."),
        },
        required: ["value"],
        unevaluatedProperties: false,
      },
    ),
  },
  $defs: {
    anyComponent: {
      oneOf: BASIC_CATALOG_V1_COMPONENT_ORDER.map((name) => ({
        $ref: `#/components/${name}`,
      })),
      discriminator: { propertyName: "component" },
    },
    anyFunction: {
      oneOf: BASIC_CATALOG_V1_FUNCTION_ORDER.map((name) => ({
        $ref: `#/functions/${name}`,
      })),
    },
    Weight: {
      type: "number",
      description:
        "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
    },
  },
};

/** Returns a fresh copy of the A2UI v1.0 `common_types.json` schema. */
export function buildV10CommonTypesSchema(): JsonObject {
  return deepCloneJson(COMMON_TYPES_V1_SCHEMA);
}

/** Returns a fresh copy of the A2UI v1.0 `agent_to_renderer.json` schema. */
export function buildV10AgentToRendererSchema(): JsonObject {
  return deepCloneJson(AGENT_TO_RENDERER_V1_SCHEMA);
}

/** Returns a fresh copy of the A2UI v1.0 Basic Catalog document. */
export function buildV10BasicCatalogDocument(): JsonObject {
  return deepCloneJson(BASIC_CATALOG_V1_DOCUMENT);
}
