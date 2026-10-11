// Text display: a safe Markdown renderer (docs from manifests / OpenAPI) and a live number that flashes on change.
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { cx } from "../cx"
import { Table } from "./data"

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g
const LIST_ITEM = /^\s*([-*]|\d+\.)\s/

/** `code`, **bold**, *italic*, [links](url) → React nodes (no HTML passes through; only http(s), /, #, . links). */
export function markdownInline(text, key = 0) {
    const out = []
    const pattern = new RegExp(INLINE.source, "g")
    let last = 0
    let match
    while ((match = pattern.exec(text))) {
        if (match.index > last) {
            out.push(text.slice(last, match.index))
        }
        const token = match[0]
        const k = `${key}-${match.index}`
        if (match[1]) {
            out.push(
                <code key={k} className="dr-code-inline">
                    {token.slice(1, -1)}
                </code>,
            )
        } else if (match[2]) {
            out.push(<strong key={k}>{markdownInline(token.slice(2, -2), key + 1)}</strong>)
        } else if (match[3]) {
            out.push(<em key={k}>{markdownInline(token.slice(1, -1), key + 1)}</em>)
        } else {
            const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
            const safe = /^(https?:|\/|#|\.)/.test(href) ? href : "#"
            const external = safe.startsWith("http")
            out.push(
                <a key={k} className="dr-link" href={safe} target={external ? "_blank" : undefined} rel="noreferrer">
                    {label}
                </a>,
            )
        }
        last = match.index + token.length
    }
    if (last < text.length) {
        out.push(text.slice(last))
    }
    return out
}

/**
 * Markdown → themed React: headings, paragraphs, lists, fenced code, tables, `code`, **bold**, *italic*, [links](url).
 * No HTML passes through. `inline` renders a single paragraph without block margins.
 * @param {{ text?: string, inline?: boolean, className?: string }} props
 */
export function Markdown({
    text,
    inline = false,
    className,
    ...rest
}: {
    text?: string
    inline?: boolean
    className?: string
}) {
    if (!text) {
        return null
    }
    const lines = String(text).replace(/\r/g, "").split("\n")
    const blocks = []
    let i = 0
    while (i < lines.length) {
        const line = lines[i]
        if (/^```/.test(line)) {
            const body = []
            i++
            while (i < lines.length && !/^```/.test(lines[i])) {
                body.push(lines[i++])
            }
            i++
            blocks.push(
                <pre key={i} className="dr-md__pre dr-scroll">
                    {body.join("\n")}
                </pre>,
            )
        } else if (/^#{1,6}\s/.test(line)) {
            const level = line.match(/^#+/)[0].length
            const Tag = level <= 2 ? "h4" : "h5"
            blocks.push(
                <Tag key={i} className="dr-md__h">
                    {markdownInline(line.replace(/^#+\s*/, ""), i)}
                </Tag>,
            )
            i++
        } else if (LIST_ITEM.test(line)) {
            const ordered = /^\s*\d+\./.test(line)
            const items = []
            while (i < lines.length && LIST_ITEM.test(lines[i])) {
                const indent = lines[i].match(/^\s*/)[0].length
                let item = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "")
                i++
                while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !LIST_ITEM.test(lines[i])) {
                    item += " " + lines[i++].trim()
                }
                items.push(
                    <li key={i} className={indent >= 2 ? "dr-md__sub" : undefined}>
                        {markdownInline(item, i)}
                    </li>,
                )
            }
            const Tag = ordered ? "ol" : "ul"
            blocks.push(<Tag key={i}>{items}</Tag>)
        } else if (/^\s*\|/.test(line)) {
            const rows = []
            while (i < lines.length && /^\s*\|/.test(lines[i])) {
                const cells = lines[i]
                    .trim()
                    .replace(/^\||\|$/g, "")
                    .split("|")
                    .map((cell) => cell.trim())
                if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) {
                    rows.push(cells)
                }
                i++
            }
            const [head = [], ...body] = rows
            blocks.push(
                <Table
                    key={i}
                    compact={true}
                    className="dr-md__table"
                    columns={head.map((cell, column) => ({
                        key: String(column),
                        label: markdownInline(cell, column),
                        render: (row) => markdownInline(row[column] ?? "", column),
                    }))}
                    rows={body}
                    rowKey={(_row, index) => index}
                />,
            )
        } else if (line.trim() === "") {
            i++
        } else {
            const paragraph = []
            while (
                i < lines.length &&
                lines[i].trim() !== "" &&
                !/^(```|#{1,6}\s|\s*([-*]|\d+\.)\s|\s*\|)/.test(lines[i])
            ) {
                paragraph.push(lines[i++].trim())
            }
            blocks.push(<p key={i}>{markdownInline(paragraph.join(" "), i)}</p>)
        }
    }
    return (
        <div className={cx("dr-md", inline && "dr-md--inline", className)} {...rest}>
            {blocks.map((block, index) => (
                <Fragment key={index}>{block}</Fragment>
            ))}
        </div>
    )
}

/**
 * A number that briefly lights up when it changes (live counts, rates). `format(value)` → text.
 * @param {{ value: number, format?: (value: number) => string, className?: string }} props
 */
export function LiveValue({
    value,
    format = String,
    className,
    ...rest
}: {
    value: number
    format?: (value: number) => string
    className?: string
}) {
    const last = useRef(value)
    const [flash, setFlash] = useState(0)
    useEffect(() => {
        if (value !== last.current) {
            last.current = value
            setFlash((count) => count + 1)
        }
    }, [value])
    return (
        <span key={flash} className={cx("dr-live-value", flash && "dr-live-value--flash", className)} {...rest}>
            {format(value)}
        </span>
    )
}

/** Box-drawing characters as ASCII: the themes' mono faces have no box-drawing glyphs (they'd fall back to a system
 * font and misalign diagrams). */
const BOX_ASCII = [
    [/[─━═╌╍┄┅]/g, "-"],
    [/[│┃║╎╏┆┇]/g, "|"],
    [/[┌┐└┘├┤┬┴┼╔╗╚╝╠╣╦╩╬╭╮╯╰┏┓┗┛┣┫┳┻╋]/g, "+"],
    [/[▶►→]/g, ">"],
    [/[◀◄←]/g, "<"],
    [/[▼↓]/g, "v"],
    [/[▲↑]/g, "^"],
]

/**
 * `html` without what runs or restyles: scripts, styles, frames, forms, `on*` handlers, `javascript:` URLs and inline
 * styles go; links open in a new tab; box-drawing in <pre> becomes ASCII. Browser only (DOMParser).
 */
export function sanitizeHtml(html) {
    const page = new DOMParser().parseFromString(String(html ?? ""), "text/html")
    for (const block of page.querySelectorAll("pre")) {
        const walker = page.createTreeWalker(block, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            node.textContent = BOX_ASCII.reduce((text, [from, to]) => text.replace(from, to), node.textContent ?? "")
        }
    }
    for (const node of page.querySelectorAll("script, style, iframe, object, embed, form, link, meta, base")) {
        node.remove()
    }
    for (const element of page.body.querySelectorAll("*")) {
        for (const attribute of [...element.attributes]) {
            const value = attribute.value.trim().toLowerCase()
            if (attribute.name.startsWith("on") || attribute.name === "style" || value.startsWith("javascript:")) {
                element.removeAttribute(attribute.name)
            }
        }
        if (element.tagName === "A") {
            element.setAttribute("target", "_blank")
            element.setAttribute("rel", "noopener noreferrer")
        }
    }
    return page.body.innerHTML
}

/**
 * HTML a server rendered (a doc page, a README), sanitized (sanitizeHtml) and set in the theme's prose type (the same
 * as Markdown's).
 * @param {{ html?: string, className?: string }} props
 */
export function SafeHtml({ html, className, ...rest }: { html?: string; className?: string }) {
    const clean = useMemo(() => (html ? sanitizeHtml(html) : ""), [html])
    return <div className={cx("dr-md", "dr-prose", className)} dangerouslySetInnerHTML={{ __html: clean }} {...rest} />
}
