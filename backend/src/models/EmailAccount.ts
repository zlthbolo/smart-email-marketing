import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class EmailAccount extends Model {
  public id!: string;
  public userId!: string;
  public email!: string;
  public smtpHost!: string;
  public smtpPort!: number;
  public smtpUser!: string;
  public smtpPassword!: string;
  public accountType!: 'gmail' | 'outlook' | 'custom';
  public dailyLimit!: number;
  public sentToday!: number;
  public lastSent!: Date;
  public isActive!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

EmailAccount.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    smtpHost: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    smtpPort: {
      type: DataTypes.INTEGER,
      defaultValue: 587,
    },
    smtpUser: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    smtpPassword: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    accountType: {
      type: DataTypes.ENUM('gmail', 'outlook', 'custom'),
      defaultValue: 'gmail',
    },
    dailyLimit: {
      type: DataTypes.INTEGER,
      defaultValue: 50,
    },
    sentToday: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    lastSent: {
      type: DataTypes.DATE,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'email_accounts',
    timestamps: true,
  }
);

export default EmailAccount;
