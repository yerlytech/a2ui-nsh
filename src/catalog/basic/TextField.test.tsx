import { describe, expect, open, test } from "nsh/test";
import { BASIC_CATALOG_V1_ID } from "../../core/catalog";

const HARNESS = "../../renderer/test_harness.tsx";

describe("Basic Catalog TextField", () => {
  test("renders label, placeholder, and initial value and writes two-way @path updates with zero remounts", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_tf",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  username: "Ada",
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["name_input", "preview_text"],
                  },
                  {
                    id: "name_input",
                    component: "TextField",
                    label: "Username",
                    placeholder: "Enter username",
                    value: { "@path": "/username" },
                  },
                  {
                    id: "preview_text",
                    component: "Text",
                    text: {
                      "@call": "formatString",
                      args: { value: "Hello ${/username}" },
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.mount": null, "a2ui.data": null },
      },
    });

    expect(app.shows("text:Username")).toBe(true);
    expect(app.value("id:s_tf:name_input")).toBe("Ada");
    expect(app.shows("text:Hello Ada")).toBe(true);

    // Clear and type a new value; verify DataModel and dependent Text update reactively.
    await app.clear("id:s_tf:name_input");
    await app.type("id:s_tf:name_input", "Grace");

    expect(app.value("id:s_tf:name_input")).toBe("Grace");
    expect(app.shows("text:Hello Grace")).toBe(true);

    await app.host.send("a2ui.readData", {
      surfaceId: "s_tf",
      path: "/username",
    });
    const readPost = app.host
      .posts()
      .filter((p) => p.name === "a2ui.data")
      .pop();
    expect(readPost?.data).toEqual({
      surfaceId: "s_tf",
      path: "/username",
      value: "Grace",
    });

    // TextField mounted exactly once across live typing edits.
    const mounts = app.host
      .posts()
      .filter(
        (p) =>
          p.name === "a2ui.mount" &&
          (p.data as { componentId?: string }).componentId === "name_input",
      );
    expect(mounts).toHaveLength(1);
  });

  test("supports shortText, longText, number, and obscured variants", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_tf_var",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  bio: "Line 1",
                  amount: "42.50",
                  secret: "s3cr3t",
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["bio_field", "num_field", "pass_field"],
                  },
                  {
                    id: "bio_field",
                    component: "TextField",
                    label: "Notes",
                    variant: "longText",
                    value: { "@path": "/bio" },
                  },
                  {
                    id: "num_field",
                    component: "TextField",
                    label: "Amount",
                    variant: "number",
                    value: { "@path": "/amount" },
                  },
                  {
                    id: "pass_field",
                    component: "TextField",
                    label: "Password",
                    variant: "obscured",
                    value: { "@path": "/secret" },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.data": null },
      },
    });

    expect(app.shows("text:Notes")).toBe(true);
    expect(app.shows("text:Amount")).toBe(true);
    expect(app.shows("text:Password")).toBe(true);
    expect(app.value("id:s_tf_var:bio_field")).toBe("Line 1");
    expect(app.value("id:s_tf_var:num_field")).toBe("42.50");
    expect(app.value("id:s_tf_var:pass_field")).toBe("s3cr3t");

    await app.type("id:s_tf_var:bio_field", "\nLine 2");
    expect(app.value("id:s_tf_var:bio_field")).toBe("Line 1\nLine 2");

    await app.clear("id:s_tf_var:num_field");
    await app.type("id:s_tf_var:num_field", "99.95");
    expect(app.value("id:s_tf_var:num_field")).toBe("99.95");

    await app.host.send("a2ui.readData", {
      surfaceId: "s_tf_var",
      path: "/amount",
    });
    const lastData = app.host
      .posts()
      .filter((p) => p.name === "a2ui.data")
      .pop();
    expect((lastData?.data as { value?: unknown }).value).toBe("99.95");
  });

  test("renders @checks error, warning, and info messages and clears errors reactively on valid input", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_tf_checks",
                catalogId: BASIC_CATALOG_V1_ID,
                dataModel: {
                  email: "bad-email",
                  nicknameWarning: {
                    valid: false,
                    code: "SHORT_NICKNAME",
                    message: "Nickname is short but allowed.",
                    severity: "warning",
                  },
                  phoneInfo: {
                    valid: false,
                    code: "OPTIONAL_PHONE",
                    message: "Optional: add a phone number",
                    severity: "info",
                  },
                },
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["email_input", "nick_input", "phone_input"],
                  },
                  {
                    id: "email_input",
                    component: "TextField",
                    label: "Email",
                    value: { "@path": "/email" },
                    "@checks": [
                      {
                        condition: {
                          "@call": "email",
                          args: { value: { "@path": "/email" } },
                        },
                        message: "Please enter a valid email address.",
                      },
                    ],
                  },
                  {
                    id: "nick_input",
                    component: "TextField",
                    label: "Nickname",
                    value: "al",
                    "@checks": [{ condition: { "@path": "/nicknameWarning" } }],
                  },
                  {
                    id: "phone_input",
                    component: "TextField",
                    label: "Phone",
                    value: "",
                    "@checks": [{ condition: { "@path": "/phoneInfo" } }],
                  },
                ],
              },
            },
          ],
        },
      },
    });

    // Error, warning, and info feedback all render.
    expect(app.shows("text:Please enter a valid email address.")).toBe(true);
    expect(app.shows("text:Nickname is short but allowed.")).toBe(true);
    expect(app.shows("text:Optional: add a phone number")).toBe(true);

    // Typing a valid email clears the error reactively.
    await app.clear("id:s_tf_checks:email_input");
    await app.type("id:s_tf_checks:email_input", "ada@example.com");
    expect(app.shows("text:Please enter a valid email address.")).toBe(false);
  });

  test("applies @accessibility label override, description, and hidden attributes", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_tf_a11y",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["default_lbl_tf", "override_lbl_tf"],
                  },
                  {
                    id: "default_lbl_tf",
                    component: "TextField",
                    label: "Tax ID",
                    value: "",
                  },
                  {
                    id: "override_lbl_tf",
                    component: "TextField",
                    label: "Phone",
                    value: "",
                    "@accessibility": {
                      label: "Contact phone number",
                      description: "Include country code",
                    },
                  },
                ],
              },
            },
          ],
        },
        handlers: { "a2ui.a11y": null },
      },
    });

    expect(app.shows("label:Tax ID")).toBe(true);
    expect(app.shows("label:Contact phone number")).toBe(true);

    const posts = app.host
      .posts()
      .filter((p) => p.name === "a2ui.a11y")
      .map((p) => p.data as { componentId?: string; snapshot?: Record<string, unknown> });

    expect(posts.find((p) => p.componentId === "default_lbl_tf")?.snapshot).toEqual({
      label: "Tax ID",
      hidden: false,
      role: "textbox",
    });
    expect(posts.find((p) => p.componentId === "override_lbl_tf")?.snapshot).toEqual({
      label: "Contact phone number",
      description: "Include country code",
      hidden: false,
      role: "textbox",
    });
  });

  test("reports the textbox role on the input for every variant in app.accessibility()", async () => {
    const app = await open(HARNESS, {
      platform: "macos",
      host: {
        params: {
          messages: [
            {
              version: "1.0",
              createSurface: {
                surfaceId: "s_tf_role",
                catalogId: BASIC_CATALOG_V1_ID,
                components: [
                  {
                    id: "root",
                    component: "Column",
                    children: ["short_tf", "long_tf", "num_tf", "pass_tf"],
                  },
                  { id: "short_tf", component: "TextField", label: "Name", value: "", variant: "shortText" },
                  { id: "long_tf", component: "TextField", label: "Notes", value: "", variant: "longText" },
                  { id: "num_tf", component: "TextField", label: "Amount", value: "", variant: "number" },
                  { id: "pass_tf", component: "TextField", label: "Password", value: "", variant: "obscured" },
                ],
              },
            },
          ],
        },
      },
    });

    for (const [id, label] of [
      ["short_tf", "Name"],
      ["long_tf", "Notes"],
      ["num_tf", "Amount"],
      ["pass_tf", "Password"],
    ] as const) {
      const node = app.accessibility(`id:s_tf_role:${id}`);
      expect(node?.role).toBe("textbox");
      expect(node?.label).toBe(label);
    }
  });
});
