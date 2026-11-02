import Big from "big.js";
import { cellText, textCell } from "./textCell";

const dayMs = 86400000;
function parseDate(value) {
  const m = /^(\d{4})([-/])(\d{2})\2(\d{2})$/.exec(value);
  if (!m) return null;
  const time = Date.UTC(+m[1], +m[3] - 1, +m[4]);
  const date = new Date(time);
  if (
    date.getUTCFullYear() !== +m[1] ||
    date.getUTCMonth() !== +m[3] - 1 ||
    date.getUTCDate() !== +m[4]
  )
    return null;
  return { time, year: +m[1], month: +m[3] - 1, day: +m[4], separator: m[2] };
}
function dateText(date, separator) {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join(separator);
}
function equalSteps(values) {
  if (values.length < 2) return null;
  const step = values[1].minus(values[0]);
  return values
    .slice(2)
    .every((value, i) => value.minus(values[i + 1]).eq(step))
    ? step
    : null;
}

export function fillGenerator(cells, direction, type = "auto") {
  const source = cells.map(
    cell => textCell(cell) || { v: "", m: "", ct: { fa: "@", t: "s" } }
  );
  const values = source.map(cellText);
  const sign = direction === "up" || direction === "left" ? -1 : 1;
  const anchor = sign > 0 ? values.length - 1 : 0;
  let calculate = null;
  if (type !== "0" && type !== "2") {
    const dates = values.map(parseDate);
    if (
      dates.every(Boolean) &&
      dates.every(date => date.separator === dates[0].separator)
    ) {
      let mode =
        type === "6"
          ? "month"
          : type === "7"
          ? "year"
          : type === "5"
          ? "workday"
          : "day";
      let step = dates.length > 1 ? (dates[1].time - dates[0].time) / dayMs : 1;
      const monthStep =
        dates.length > 1
          ? (dates[1].year - dates[0].year) * 12 +
            dates[1].month -
            dates[0].month
          : 1;
      if (
        (type === "auto" || type === "1" || type === "3") &&
        dates.length > 1 &&
        monthStep &&
        dates.every(
          (date, i) =>
            date.day === dates[0].day &&
            (date.year - dates[0].year) * 12 + date.month - dates[0].month ===
              monthStep * i
        )
      )
        mode = "month";
      if (mode === "month") step = monthStep;
      if (mode === "year")
        step = dates.length > 1 ? dates[1].year - dates[0].year : 1;
      const regular =
        dates.length === 1 ||
        mode !== "day" ||
        dates.every(
          (date, i) => date.time === dates[0].time + step * i * dayMs
        );
      if (regular)
        calculate = i => {
          const base = dates[anchor];
          let date;
          if (mode === "month" || mode === "year") {
            const month =
              base.month + step * i * sign * (mode === "year" ? 12 : 1);
            date = new Date(Date.UTC(base.year, month, 1));
            date.setUTCDate(
              Math.min(
                base.day,
                new Date(
                  Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
                ).getUTCDate()
              )
            );
          } else if (mode === "workday") {
            date = new Date(base.time);
            do {
              date.setUTCDate(date.getUTCDate() + sign);
            } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
            const remaining = i - 1;
            date.setUTCDate(
              date.getUTCDate() + Math.floor(remaining / 5) * 7 * sign
            );
            for (let n = 0; n < remaining % 5; n++) {
              do {
                date.setUTCDate(date.getUTCDate() + sign);
              } while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
            }
          } else date = new Date(base.time + step * i * sign * dayMs);
          return dateText(date, base.separator);
        };
    } else if (values.every(value => /^-?\d+(?:\.\d+)?$/.test(value))) {
      const nums = values.map(value => new Big(value));
      const step =
        values.length > 1 ? equalSteps(nums) : type === "1" ? new Big(1) : null;
      const decimals = Math.max(
        ...values.map(value => (value.split(".")[1] || "").length)
      );
      const width = values.some(value => /^-?0\d/.test(value))
        ? Math.max(
            ...values.map(value => value.replace(/^-/, "").split(".")[0].length)
          )
        : 0;
      if (step)
        calculate = i => {
          const value = nums[anchor]
            .plus(step.times(i * sign))
            .toFixed(decimals);
          const parts = value.replace(/^-/, "").split(".");
          parts[0] = parts[0].padStart(width, "0");
          return (value[0] === "-" ? "-" : "") + parts.join(".");
        };
    } else {
      const numbered = values.map(value => /^(.*?)(\d+)$/.exec(value));
      if (
        numbered.every(Boolean) &&
        numbered[0][1] &&
        !/[\d.\-/]$/.test(numbered[0][1]) &&
        numbered.every(match => match[1] === numbered[0][1])
      ) {
        const nums = numbered.map(match => new Big(match[2]));
        const step = nums.length > 1 ? equalSteps(nums) : new Big(1);
        const width = Math.max(...numbered.map(match => match[2].length));
        if (step)
          calculate = i =>
            numbered[0][1] +
            (nums[anchor].plus(step.times(i * sign)).lt(0) ? "-" : "") +
            nums[anchor]
              .plus(step.times(i * sign))
              .abs()
              .toFixed(0)
              .padStart(width, "0");
      } else {
        const weeks = values.map(value =>
          /^(周|星期)?([一二三四五六日天])$/.exec(value)
        );
        if (
          weeks.every(Boolean) &&
          weeks.every(match => match[1] === weeks[0][1])
        ) {
          const nums = weeks.map(match =>
            match[2] === "天" ? 6 : "一二三四五六日".indexOf(match[2])
          );
          const step = nums.length > 1 ? (nums[1] - nums[0] + 7) % 7 : 1;
          if (nums.every((num, i) => num === (nums[0] + step * i) % 7))
            calculate = i =>
              (weeks[0][1] || "") +
              "一二三四五六日"[
                (((nums[anchor] + step * i * sign) % 7) + 7) % 7
              ];
        }
      }
    }
  }
  return i => {
    const index =
      sign > 0
        ? (i - 1) % source.length
        : source.length - 1 - ((i - 1) % source.length);
    const cell = { ...source[index] };
    delete cell.mc;
    if (calculate) {
      cell.v = calculate(i);
      cell.m = cell.v;
      cell.ct = { fa: "@", t: "s" };
    }
    return cell;
  };
}
