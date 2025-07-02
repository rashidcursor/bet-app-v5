import Agenda from "agenda";

const agenda = new Agenda({
  db: {
    address: process.env.MONGODB_URI || "mongodb://localhost:27017/bet-app",
    collection: "agendaJobs",
  },
});

export default agenda;
