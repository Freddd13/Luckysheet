const theme = [
  "#ffffff",
  "#000000",
  "#e7e6e6",
  "#44546a",
  "#5b9bd5",
  "#ed7d31",
  "#a5a5a5",
  "#ffc000",
  "#4472c4",
  "#70ad47",
];
function tint(color, amount) {
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  return (
    "#" +
    rgb
      .map(value =>
        Math.round(
          amount >= 0 ? value + (255 - value) * amount : value * (1 + amount)
        )
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}
export const officePalette = [
  theme,
  ...[0.8, 0.6, 0.4, -0.25, -0.5].map(amount =>
    theme.map((color, i) =>
      i === 0
        ? ["#f2f2f2", "#d9d9d9", "#bfbfbf", "#a6a6a6", "#7f7f7f"][
            [0.8, 0.6, 0.4, -0.25, -0.5].indexOf(amount)
          ]
        : i === 1
        ? ["#7f7f7f", "#595959", "#404040", "#262626", "#0d0d0d"][
            [0.8, 0.6, 0.4, -0.25, -0.5].indexOf(amount)
          ]
        : tint(color, amount)
    )
  ),
  [
    "#c00000",
    "#ff0000",
    "#ffc000",
    "#ffff00",
    "#92d050",
    "#00b050",
    "#00b0f0",
    "#0070c0",
    "#002060",
    "#7030a0",
  ],
];
