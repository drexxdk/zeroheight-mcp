export class JobCancelled extends Error {
  constructor(message = "Job cancelled") {
    super(message);
    this.name = "JobCancelled";
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, JobCancelled.prototype);
  }
}

export default JobCancelled;
