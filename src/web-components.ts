/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

/*
 * A web component to load an SVG file and insert it into the DOM. The <load-file> tag can be used in HTML like this:
 * <load-file src="path/to/file.svg"></load-file>.
 */
customElements.define("load-file",
    class extends HTMLElement {
        public async connectedCallback() {
            const src = this.getAttribute("src");
            if (!src) {
                return;
            }

            const res = await fetch(src);
            const text = await res.text();

            const tpl = document.createElement("template");
            tpl.innerHTML = text.trim();

            this.innerHTML = "";
            const svg = tpl.content.firstElementChild as SVGElement | null;
            if (!svg) {
                return;
            }

            // Move any classes from the <load-file> element to the loaded SVG, so that styles can be applied.
            if (this.className) {
                svg.classList.add(...Array.from(this.classList));
            }

            for (const { name, value } of Array.from(this.attributes)) {
                if (name === "src") {
                    continue;
                }
                svg.setAttribute(name, value);
            }

            this.appendChild(svg);
        }
    }
);
