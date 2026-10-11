// Markdown and the flashing live value. Tokens only.
export const TEXT_CSS = /* css */ `
/* markdown */
.dr-md { font-size: 13.5px; line-height: 1.6; color: var(--fg); }
.dr-md > :first-child { margin-top: 0; }
.dr-md > :last-child { margin-bottom: 0; }
.dr-md p { margin: 0 0 10px; }
.dr-md ul, .dr-md ol { margin: 0 0 10px; padding-left: 20px; }
.dr-md li { margin: 2px 0; }
.dr-md li.dr-md__sub { margin-left: 18px; }
.dr-md .dr-md__h { margin: 14px 0 6px; color: var(--fg); font-weight: 600; }
.dr-md h4.dr-md__h { font-size: 14px; }
.dr-md h5.dr-md__h { font-size: 13px; color: var(--muted-fg); }
.dr-md__pre {
    margin: 0 0 10px;
    padding: 10px 12px;
    background: var(--code-bg);
    color: var(--code-fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font: 12px/1.5 var(--mono);
    overflow: auto;
    white-space: pre;
}
.dr-md__table { margin: 0 0 10px; }
.dr-md--inline, .dr-md--inline p { display: inline; margin: 0; }

/* live value */
.dr-live-value { font-variant-numeric: tabular-nums; border-radius: 3px; }
.dr-live-value--flash { animation: dr-live-flash 0.9s ease-out; }
@keyframes dr-live-flash {
    from { background: var(--sel); color: var(--primary); }
    to { background: transparent; }
}
`
