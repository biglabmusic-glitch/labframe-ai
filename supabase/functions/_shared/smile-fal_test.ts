import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createFalSmileTask,
  pollFalSmileTask,
  smileProviderConfig,
} from "./smile-fal.ts";
import { FAL_FILL_MODEL } from "./image-tasks.ts";
import { SmileError, validateSmileSettings } from "./smile-preview.ts";
const settings = {
  teeth: [11],
  shades: { "11": "A1" },
  shape: "original",
  zenithMode: "preserve",
  translucency: "natural",
} as const;
const input = {
  photoData: "data:image/png;base64,AA==",
  maskData: "data:image/png;base64,AQ==",
  settings: { ...settings, teeth: [11] },
  signal: AbortSignal.timeout(5000),
};
Deno.test("alternative smile processor needs an explicit approval and matching key", async () => {
  Deno.env.set("SMILE_PROVIDER", "fal");
  Deno.env.delete("SMILE_EXTERNAL_PROVIDER_APPROVED");
  assertEquals(
    (await assertRejects(() => createFalSmileTask(input), SmileError)).code,
    "not_configured",
  );
  Deno.env.set("SMILE_EXTERNAL_PROVIDER_APPROVED", "fal");
  Deno.env.set("FAL_KEY", "fixture");
  assertEquals(smileProviderConfig().providerName, "fal");
  assertEquals(
    (await assertRejects(
      () =>
        createFalSmileTask({
          ...input,
          photoData: "https://private.example/portrait.png",
        }),
      SmileError,
    )).code,
    "provider_response",
  );
});
Deno.test("fal smile Fill uses only the PNG crop and native mask, without a second reference image", async () => {
  Deno.env.set("SMILE_EXTERNAL_PROVIDER_APPROVED", "fal");
  Deno.env.set("FAL_KEY", "fixture");
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assertEquals(String(url), `https://queue.fal.run/${FAL_FILL_MODEL}`);
      const body = JSON.parse(String(init?.body));
      assertEquals(body.image_url, input.photoData);
      assertEquals(body.mask_url, input.maskData);
      assertEquals(body.image_urls, undefined);
      assertEquals(body.prompt.includes("SECOND image"), false);
      assertEquals(body.prompt.includes("inpainting mask"), true);
      return Response.json({ request_id: "fill-smile" });
    };
    assertEquals(
      await createFalSmileTask({ ...input, model: FAL_FILL_MODEL }),
      { status: "processing", id: "fill-smile" },
    );
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("fal smile jobs poll their pinned model even after configuration changes", async () => {
  const original = globalThis.fetch;
  Deno.env.set("FAL_SMILE_MODEL", "fal-ai/nano-banana/edit");
  const calls: string[] = [];
  try {
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      return Response.json({ status: "IN_PROGRESS" });
    };
    assertEquals(
      await pollFalSmileTask("old-fill-task", input.signal, FAL_FILL_MODEL),
      { status: "processing", id: "old-fill-task" },
    );
    assertEquals(calls, [
      "https://queue.fal.run/fal-ai/flux-pro/requests/old-fill-task/status",
    ]);
    calls.length = 0;
    await pollFalSmileTask("legacy-nano-task", input.signal);
    assertEquals(calls, [
      "https://queue.fal.run/fal-ai/nano-banana/requests/legacy-nano-task/status",
    ]);
  } finally {
    globalThis.fetch = original;
    Deno.env.delete("FAL_SMILE_MODEL");
  }
});
Deno.test("fal smile configuration selects only supported models and preserves the previous default", async () => {
  Deno.env.set("SMILE_PROVIDER", "fal");
  Deno.env.set("SMILE_EXTERNAL_PROVIDER_APPROVED", "fal");
  Deno.env.set("FAL_KEY", "fixture");
  try {
    Deno.env.delete("FAL_SMILE_MODEL");
    assertEquals(
      smileProviderConfig().providerModel,
      "fal-ai/nano-banana/edit",
    );
    Deno.env.set("FAL_SMILE_MODEL", FAL_FILL_MODEL);
    assertEquals(smileProviderConfig().providerModel, FAL_FILL_MODEL);
    Deno.env.set("FAL_SMILE_MODEL", "fal-ai/not-approved");
    await assertRejects(async () => smileProviderConfig(), SmileError);
  } finally {
    Deno.env.delete("FAL_SMILE_MODEL");
    Deno.env.delete("SMILE_PROVIDER");
  }
});
Deno.test("fal receives only the supplied crop and mask and submits once", async () => {
  Deno.env.set("SMILE_EXTERNAL_PROVIDER_APPROVED", "fal");
  Deno.env.set("FAL_KEY", "fixture");
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      assertEquals(
        String(url),
        "https://queue.fal.run/fal-ai/nano-banana/edit",
      );
      const body = JSON.parse(String(init?.body));
      assertEquals(body.image_urls, [input.photoData, input.maskData]);
      return Response.json({ request_id: "smile-fixture" });
    };
    assertEquals(await createFalSmileTask(input), {
      status: "processing",
      id: "smile-fixture",
    });
    assertEquals(calls, 1);
  } finally {
    globalThis.fetch = original;
    Deno.env.delete("SMILE_PROVIDER");
    Deno.env.delete("SMILE_EXTERNAL_PROVIDER_APPROVED");
  }
});

Deno.test("crop rehabilitation: fal Nano Banana gets one photo, while Fill keeps its native mask", async () => {
  Deno.env.set("SMILE_EXTERNAL_PROVIDER_APPROVED", "fal");
  Deno.env.set("FAL_KEY", "fixture");
  const original = globalThis.fetch;
  try {
    for (const model of ["fal-ai/nano-banana/edit", FAL_FILL_MODEL]) {
      let calls = 0;
      globalThis.fetch = async (_url, init) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        assertEquals(body.prompt.includes("BOTH the UPPER and LOWER jaws"), true);
        assertEquals(body.prompt.includes("SECOND image"), false);
        if (model === FAL_FILL_MODEL) {
          assertEquals(body.image_url, input.photoData);
          assertEquals(body.mask_url, input.maskData);
          assertEquals(body.image_urls, undefined);
          assertEquals(body.prompt.includes("inpainting mask"), true);
        } else {
          assertEquals(body.image_urls, [input.photoData]);
          assertEquals(body.mask_url, undefined);
          assertEquals(body.prompt.includes("no tooth selection or tooth mask is provided"), true);
        }
        return Response.json({ request_id: "crop-smile" });
      };
      const cropSettings = validateSmileSettings({ ...settings, rehabilitationMode: "front", shade: "A1" });
      assertEquals(await createFalSmileTask({ ...input, settings: cropSettings, model }), {
        status: "processing", id: "crop-smile",
      });
      assertEquals(calls, 1);
    }
  } finally {
    globalThis.fetch = original;
    Deno.env.delete("SMILE_EXTERNAL_PROVIDER_APPROVED");
    Deno.env.delete("FAL_KEY");
  }
});
