import { describe, it, expect } from "vitest";
import { validateBingImageId } from "./bing";

describe("validateBingImageId (S6 準拠)", () => {
  it("英数字・アンダースコア・ハイフン・ピリオドのみの正常なIDを許可する", () => {
    expect(validateBingImageId("OHR.FujiSpring_JA-JP12345")).toBe("OHR.FujiSpring_JA-JP12345");
    expect(validateBingImageId("image_123.jpg")).toBe("image_123.jpg");
    expect(validateBingImageId("bing-daily-wallpaper-2026")).toBe("bing-daily-wallpaper-2026");
  });

  it("空文字・空白文字は null を返す", () => {
    expect(validateBingImageId("")).toBeNull();
    expect(validateBingImageId("   ")).toBeNull();
  });

  it("XSSやインジェクションを意図した不正文字が含まれる場合は null を返す (S6)", () => {
    expect(validateBingImageId("image<script>alert(1)</script>")).toBeNull();
    expect(validateBingImageId("image' OR 1=1--")).toBeNull();
    expect(validateBingImageId("image\" onerror=\"alert(1)")).toBeNull();
    expect(validateBingImageId("image; rm -rf /")).toBeNull();
    expect(validateBingImageId("../../etc/passwd")).toBeNull();
    expect(validateBingImageId("image url with spaces")).toBeNull();
  });
});

