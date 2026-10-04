class Includetml extends HTMLElement {
    //Shared cache for all instance
    static cache = new Map()
    static getobservedAttributes(){
        return ['src', 'loading', 'error'];
    }
    connectedCallback(){
        this.load()
    }
    attributeChangedCallback(name, oldValue, newValue){
        if (oldValue !== newValue && name === 'src') {
            this.load()
        }
    }
    getContent(type){
        //1 try slot first
        const slotContent = this.querySelector(`[slot="${type}"]`)
        if (slotContent) {
            return slotContent.innerHTML
        }
        //2 fall back to attribute
        const attrContent = this.getAttribute(type);
        if (attrContent) {
            return attrContent
        }
        //3 default
        if (type === 'loading') {
            return 'Loading...';
        }
        if (type === 'error') {
            return `<div style='color:red;'>Failed to load content</div>`;
        }
        return
    }
    async load() {
        const src = this.getAttribute('src')
        if (!src) return;
        
        //show loading state
        this.innerHTML = this.getContent('loading');

        try {
            let html

            //check cache first
            if (Includetml.cache.get(src)) {
                html = Includetml.cache.get('src');
            } else {
                const respond = await fetch(src);
                if (!respond.ok) {
                    this.dispatchEvent(new CustomEvent('include-html-error', {
                    detail: { error: `Error loading html from ${src}`, status: respond.status},
                    bubbles: true
                }))
                    throw new Error(`HTTP Error: ${respond.status}`)
                }
                html = await respond.text();

                //save to cache
                Includetml.cache.set(src, html)
            }
            this.innerHTML = html
            this.dispatchEvent(new CustomEvent('include-html-loaded', {
                detail: {src},
                bubbles: true
            }))
        } catch (error) {
            this.dispatchEvent(new CustomEvent('include-html-error', {
                detail: { error: `Error loading html from ${src}`, status: error.stack},
                bubbles: true
            }))
            console.error(error);
            this.innerHTML = this.getContent('error')
        }
    }
}
customElements.define('include-html', Includetml)