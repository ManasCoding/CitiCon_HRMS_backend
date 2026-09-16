import express from 'express';
import EmployeePerformance from '../models/EmployeePerformance.js';
import Employee from '../models/Employee.js'; // Need Employee to populate details
import PerformanceRating from '../models/PerformanceRating.js';

const router = express.Router();

// Seed data function to ensure we have something to display
const seedInitialData = async () => {
  const employees = await Employee.find();
  for (const emp of employees) {
    const existing = await EmployeePerformance.findOne({ employeeId: emp._id });
    if (!existing) {
      const qow = (Math.random() * 2) + 3; // 3.0 to 5.0
      const prod = (Math.random() * 2) + 3;
      const comm = (Math.random() * 2) + 3;
      const team = (Math.random() * 2) + 3;
      const punc = (Math.random() * 2) + 3;
      const prob = (Math.random() * 2) + 3;
      
      const goalsCompleted = Math.floor(Math.random() * 40) + 60; // 60 to 100

      const perf = new EmployeePerformance({
        employeeId: emp._id,
        parameters: {
          qualityOfWork: parseFloat(qow.toFixed(1)),
          productivity: parseFloat(prod.toFixed(1)),
          communication: parseFloat(comm.toFixed(1)),
          teamwork: parseFloat(team.toFixed(1)),
          punctuality: parseFloat(punc.toFixed(1)),
          problemSolving: parseFloat(prob.toFixed(1))
        },
        goalsCompleted,
        lastReviewDate: new Date(),
      });
      await perf.save();
    }
  }
};

// GET /api/performance
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // 1. Fetch all employees
    const employees = await Employee.find({ status: 'Active' });
    
    // 2. Fetch all ratings (with optional date filter)
    let ratingQuery = {};
    if (startDate && endDate) {
      ratingQuery.workDate = { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      };
    }
    const allRatings = await PerformanceRating.find(ratingQuery);
    
    // 3. Fetch goalsCompleted from EmployeePerformance if it exists
    const allEmployeePerf = await EmployeePerformance.find();
    const perfMap = {};
    allEmployeePerf.forEach(p => {
      perfMap[p.employeeId.toString()] = p.goalsCompleted || 0;
    });

    // 4. Calculate Data
    let totalRatingsSum = 0;
    let totalRatingsCount = allRatings.length;
    
    let distribution = {
      oneStar: 0,
      twoStars: 0,
      threeStars: 0,
      fourStars: 0,
      fiveStars: 0,
      total: totalRatingsCount
    };
    
    // Map ratings by employee
    const ratingsByEmp = {};
    allRatings.forEach(r => {
      if (!ratingsByEmp[r.employeeId.toString()]) {
        ratingsByEmp[r.employeeId.toString()] = { sum: 0, count: 0, lastReview: null };
      }
      ratingsByEmp[r.employeeId.toString()].sum += r.rating;
      ratingsByEmp[r.employeeId.toString()].count += 1;
      
      if (!ratingsByEmp[r.employeeId.toString()].lastReview || new Date(r.workDate) > new Date(ratingsByEmp[r.employeeId.toString()].lastReview)) {
        ratingsByEmp[r.employeeId.toString()].lastReview = r.workDate;
      }
      
      totalRatingsSum += r.rating;
      
      if (r.rating === 1) distribution.oneStar++;
      else if (r.rating === 2) distribution.twoStars++;
      else if (r.rating === 3) distribution.threeStars++;
      else if (r.rating === 4) distribution.fourStars++;
      else if (r.rating === 5) distribution.fiveStars++;
    });

    // Employee List formatting
    let topPerformersCount = 0;
    let totalGoalsSum = 0;

    const formattedEmployees = employees.map(emp => {
      const empIdStr = emp._id.toString();
      const rData = ratingsByEmp[empIdStr] || { sum: 0, count: 0, lastReview: null };
      const avgRating = rData.count > 0 ? (rData.sum / rData.count) : 0;
      
      let status = 'No rating yet';
      if (avgRating >= 4.5) status = 'Excellent';
      else if (avgRating >= 3.5) status = 'Good';
      else if (avgRating >= 2.5) status = 'Average';
      else if (avgRating > 0) status = 'Needs Improvement';
      
      if (avgRating >= 4.5) topPerformersCount++;
      
      const goalsCompleted = perfMap[empIdStr] || 0;
      totalGoalsSum += goalsCompleted;

      return {
        employeeId: empIdStr,
        name: emp.fullName,
        role: emp.department || emp.role || 'N/A', // fallback if department doesn't exist
        avatar: emp.profileImage || null,
        averageRating: parseFloat(avgRating.toFixed(1)),
        totalRatings: rData.count,
        goalsCompleted: goalsCompleted,
        lastReview: rData.lastReview ? rData.lastReview.toISOString().split('T')[0] : null,
        status: status
      };
    });

    // Sort employees by averageRating DESC
    formattedEmployees.sort((a, b) => b.averageRating - a.averageRating);

    const averageGlobalRating = totalRatingsCount > 0 ? (totalRatingsSum / totalRatingsCount).toFixed(1) : 0;
    const avgGoalsCompleted = employees.length > 0 ? Math.round(totalGoalsSum / employees.length) : 0;

    const overview = [
      { subject: 'Quality of Work', A: averageGlobalRating, fullMark: 5 },
      { subject: 'Productivity', A: averageGlobalRating, fullMark: 5 },
      { subject: 'Communication', A: averageGlobalRating, fullMark: 5 },
      { subject: 'Teamwork', A: averageGlobalRating, fullMark: 5 },
      { subject: 'Punctuality', A: averageGlobalRating, fullMark: 5 },
      { subject: 'Problem Solving', A: averageGlobalRating, fullMark: 5 },
    ];

    res.json({
      success: true,
      data: {
        summary: {
          totalEmployees: employees.length,
          averageRating: parseFloat(averageGlobalRating),
          topPerformers: topPerformersCount,
          goalsCompleted: avgGoalsCompleted,
          overview: overview
        },
        distribution,
        employees: formattedEmployees
      }
    });
    
  } catch (error) {
    console.error('Error fetching performance data:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/performance/:employeeId
router.get('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Validate ObjectId format
    if (!employeeId.match(/^[a-fA-F0-9]{24}$/)) {
      return res.status(400).json({ message: 'Invalid employee ID' });
    }

    // Safely upsert — creates a default profile if none exists, never duplicates
    await EmployeePerformance.findOneAndUpdate(
      { employeeId },
      {
        $setOnInsert: {
          parameters: {
            qualityOfWork: 0,
            productivity: 0,
            communication: 0,
            teamwork: 0,
            punctuality: 0,
            problemSolving: 0
          },
          overallRating: 0,
          goalsCompleted: 0,
          status: 'Average'
        }
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // Now fetch with populate
    const perf = await EmployeePerformance.findOne({ employeeId }).populate('employeeId');
    const perfObj = perf.toObject();

    // Also fetch ratings from PerformanceRating model
    const ratings = await PerformanceRating.find({ employeeId }).sort({ workDate: -1 });

    if (ratings.length > 0) {
      const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
      const avgRating = parseFloat((sum / ratings.length).toFixed(1));
      perfObj.overallRating = avgRating;

      // Compute status from average rating
      if (avgRating >= 4.5) perfObj.status = 'Excellent';
      else if (avgRating >= 3.5) perfObj.status = 'Good';
      else if (avgRating >= 2.5) perfObj.status = 'Average';
      else if (avgRating > 0) perfObj.status = 'Needs Improvement';
      else perfObj.status = 'No rating yet';

      // Add recent reviews from PerformanceRating
      perfObj.recentReviews = ratings.slice(0, 5).map(r => ({
        rating: r.rating,
        date: r.workDate,
        comment: r.comment || '',
        ratedBy: r.ratedBy || 'Admin'
      }));

      perfObj.lastReviewDate = ratings[0].workDate;
    }

    res.json(perfObj);
  } catch (error) {
    console.error('Error fetching employee performance:', error);
    res.status(500).json({ message: 'Server error', detail: error.message });
  }
});

// PUT /api/performance/:employeeId/review
router.put('/:employeeId/review', async (req, res) => {
  try {
    const { parameters, comments, reviewer } = req.body;
    let perf = await EmployeePerformance.findOne({ employeeId: req.params.employeeId });
    if (!perf) return res.status(404).json({ message: 'Performance not found' });

    perf.parameters = parameters;
    perf.lastReviewDate = new Date();
    
    // Save to trigger pre-save hook for overallRating
    await perf.save();
    
    // Push review to history
    perf.reviews.push({
      reviewer: reviewer || 'Admin',
      rating: perf.overallRating,
      comments: comments || ''
    });
    
    await perf.save();

    res.json({ message: 'Review added successfully', perf });
  } catch (error) {
    console.error('Error saving review:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/performance/ratings
router.post('/ratings', async (req, res) => {
  try {
    const { employeeId, taskId, adminId, rating, feedback, workDate } = req.body;
    
    if (!employeeId || !rating || !workDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Upsert the rating for this employee and date (assuming one rating per day)
    const newRating = await PerformanceRating.findOneAndUpdate(
      { employeeId, workDate: new Date(workDate) },
      { 
        $set: { 
          rating: Number(rating), 
          feedback: feedback || '', 
          ...(taskId && { taskId }),
          ...(adminId && { adminId })
        } 
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      message: "Performance rating submitted successfully",
      data: newRating
    });
  } catch (error) {
    console.error('Error saving rating:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/performance/:employeeId/ratings — remove all ratings for an employee
router.delete('/:employeeId/ratings', async (req, res) => {
  try {
    const { employeeId } = req.params;

    if (!employeeId.match(/^[a-fA-F0-9]{24}$/)) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID' });
    }

    const result = await PerformanceRating.deleteMany({ employeeId });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} rating(s) for this employee`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting ratings:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
