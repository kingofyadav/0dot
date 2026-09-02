import { Linking, View } from "react-native";
import { render } from "@testing-library/react-native";
import { renderWikiMarkdown } from "../wiki-markdown";
import { useTheme } from "../../theme";

// renderWikiMarkdown takes a Theme object directly (not a hook itself), so
// a tiny host component supplies one via useTheme() — same as any other
// themed screen under test (see CommunityChatBody.test.tsx).
function Host({ body }: { body: string }) {
  const theme = useTheme();
  return <View>{renderWikiMarkdown(body, theme)}</View>;
}

describe("renderWikiMarkdown (mobile)", () => {
  it("renders headings at three levels", async () => {
    const { getByText } = await render(<Host body={"# H1\n\n## H2\n\n### H3"} />);
    expect(getByText("H1")).toBeTruthy();
    expect(getByText("H2")).toBeTruthy();
    expect(getByText("H3")).toBeTruthy();
  });

  it("renders bold, italic, and inline code", async () => {
    const { getByText } = await render(<Host body={"**bold** and *italic* and `code`"} />);
    expect(getByText("bold")).toBeTruthy();
    expect(getByText("italic")).toBeTruthy();
    expect(getByText("code")).toBeTruthy();
  });

  it("renders a link as tappable text that opens the URL", async () => {
    const openURLSpy = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const { getByText } = await render(<Host body="See [the docs](https://example.com/docs) for more." />);
    const link = getByText("the docs");
    link.props.onPress();
    expect(openURLSpy).toHaveBeenCalledWith("https://example.com/docs");
    openURLSpy.mockRestore();
  });

  it("renders a bullet list", async () => {
    const { getByText } = await render(<Host body={"- first item\n- second item"} />);
    expect(getByText("first item")).toBeTruthy();
    expect(getByText("second item")).toBeTruthy();
  });

  it("renders an intro paragraph immediately followed by bullets (no blank line) as separate runs", async () => {
    const { getByText } = await render(<Host body={"Intro line\n- bullet one\n- bullet two"} />);
    expect(getByText("Intro line")).toBeTruthy();
    expect(getByText("bullet one")).toBeTruthy();
    expect(getByText("bullet two")).toBeTruthy();
  });

  it("renders plain paragraphs", async () => {
    const { getByText } = await render(<Host body={"First paragraph.\n\nSecond paragraph."} />);
    expect(getByText("First paragraph.")).toBeTruthy();
    expect(getByText("Second paragraph.")).toBeTruthy();
  });
});
