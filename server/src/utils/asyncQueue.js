class AsyncQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        resolve,
        reject
      });
      
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      
      try {
        const result = await task();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }

  get length() {
    return this.queue.length;
  }

  isProcessing() {
    return this.processing;
  }
}

export default AsyncQueue;
