# UTAU OTO Overlap Editor

用于批量调整 UTAU `oto.ini` 中 **Overlap（重叠）** 数值的浏览器小工具。

**作者：itsukiMNE**

当前版本：**v0.13**

## 功能

- 完全在浏览器本地运行，不上传 `oto.ini`。
- 只修改第 6 个参数 **Overlap**。
- 不修改 Offset、Consonant、Cutoff、Preutterance 等其他参数。
- 根据 Alias 自动分类并计算 Overlap。
- 计算结果统一四舍五入到小数点后 1 位。
- 修改前可预览 Alias、识别对象、Preutterance、分类、原 Overlap、新 Overlap。
- 通过复制完整结果的方式使用，不直接导出新的 `oto.ini`。
- 支持读取日文 ANSI（CP932 / Shift_JIS）文件。
- 在中文 ANSI 环境中使用时，可复制为对应的乱码文本，以尽量保持原来的日文 ANSI 字节。
- Alias 末尾带 `C4`、`D#4`、`Eb3` 等音阶标记时，会先忽略音阶，再用前面的 Alias 判断类别。

## 自动调整规则

| Alias 类型 | Overlap |
| --- | --- |
| K / T / P 系及相关拗音、扩展音 | `-5` |
| W / Y 系 | `Preutterance / 2 - 1` |
| 母音、`を`、`ん` | `Preutterance × 2` |
| `a/i/u/e/o/n R...`、`a/i/u/e/o/n E`、`a/i/u/e/o/n -` 等语尾 | `Preutterance / 2 - 1` |
| 其他 | `Preutterance / 3` |

### 优先规则

以下规则优先于普通分类：

- `- X` 格式无论 `X` 是什么，都按“其他”处理，即 `Preutterance / 3`。
- `a / i / u / e / o / n + 假名` 格式一律按“其他”处理。
- `- / a / i / u / e / o / n + E + 假名`，例如 `a Eん`，一律按“其他”处理。
- Alias 识别对象只要以 `ん` 开头，就按 `ん` 处理，后面即使还有字母或其他标记也不影响。
- 母音假名后带数字编号，例如 `あ2`、`い03`、`を1`，仍按母音处理。
- Alias 末尾的音阶标记只用于区分音阶，不参与分类判断。

## 使用方法

1. 下载本项目文件。
2. 保持 `index.html` 和 `script.js` 在同一文件夹内。
3. 用浏览器打开 `index.html`。
4. 选择需要处理的 `oto.ini`。
5. 点击“生成预览”。
6. 确认分类和新 Overlap 数值。
7. 点击“复制日语结果”，然后粘贴回原来的 `oto.ini`。
8. 如果是在中文 ANSI 环境中处理原本为日文 ANSI 的文件，可根据需要使用“复制为中文 ANSI 乱码”。

## 文件结构

```text
index.html
script.js
README.md
```

## 关于编码

工具读取文件时会优先识别 UTF-8；如果不是有效 UTF-8，则按日文 ANSI（CP932 / Shift_JIS）读取。

由于浏览器直接重新导出文本文件时容易改变编码，本工具目前采用“复制结果 → 粘贴回原文件”的方式，避免额外转码。

## 注意

本工具以标准 UTAU `oto.ini` 格式为前提。Alias 的音阶后缀等只会在分类时临时忽略，不会改写原始 Alias。
