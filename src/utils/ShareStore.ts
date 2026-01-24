/**
 * Simple singleton to hold the URI outside of the React Component tree.
 * This prevents data loss during navigation resets or cold starts.
 */
export const ShareStore = {
  pendingUri: null as string | null,
  
  setUri(uri: string) {
    console.log("📥 ShareStore: URI saved", uri);
    this.pendingUri = uri;
  },
  
  getAndClearUri() {
    const uri = this.pendingUri;
    this.pendingUri = null;
    if (uri) console.log("📤 ShareStore: URI retrieved and cleared");
    return uri;
  }
};